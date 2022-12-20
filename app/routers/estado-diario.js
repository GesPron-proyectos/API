const express = require("express");
const router = express.Router();
const puppeteer = require('puppeteer-extra');
const config = require("../config");
const https = require('https');
const causaModel = require("../models/causamodel");
const doctoModel = require('../models/doctomodel');

const hidden = require('puppeteer-extra-plugin-stealth');

const { executablePath } = require('puppeteer');

const { v4: uuidv4 } = require('uuid');

router.get("/*", (req, res) => {
    res.json(config.version);
});

// obtener estado diario
/**
 * @swagger
 * components:
 *  schemas:
 *      User:
 *          type: object
 *          properties:
 *              usuario:
 *                  type: string
 *                  description: Usuario PJUD
 *              password:
 *                  type: string
 *                  description: Clave PJUD
 *              receptor:
 *                  type: boolean
 *                  description: Obtener notificacion receptores
 *              fecha:
 *                  type: string
 *                  description: Fecha consulta dd/mm/yyy (opcional) fecha de consulta estado. Por defecto toma la fecha actual y resta 1 dia para la consulta. Si es Lunes consulta Viernes y Sabado
 *          required:
 *              - usuario
 *              - password
 *          example:
 *              usuario: "12345678"
 *              password: password
 *              receptor: true
 *              fecha: "31/12/2022"
 *      Error:
 *          type: object
 *          properties:
 *              status:
 *                  type: number
 *                  description: status
 *              msg:
 *                  type: string
 *                  description: mensaje de error
 *              data:
 *                  type: string
 *                  description: descripcion del error
 *          example:
 *              status: 500
 *              msg: "Error"
 *              data: "Timeout"
 *      Causa:
 *          type: object
 *          properties:
 *              uuid:
 *                  type: string
 *                  description: uuid generado de la causa
 *              Rol:
 *                  type: string
 *                  description: rol de la causa
 *              Tribunal:
 *                  type: string
 *                  description: tribunal de la causa
 *              Caratulado:
 *                  type: string
 *                  description: caratulado de la causa
 *              documentos:
 *                  type: array
 *                  description: documentos de la causa
 *                  items:
 *                      type: object
 *              cuadernos:
 *                  type: array
 *                  description: cuadernos de la causa
 *                  items:
 *                      type: object
 *              receptores:
 *                  type: array
 *                  description: receptores de la causa
 *                  items:
 *                      type: object
 *              usuarios:
 *                  type: array
 *                  description: usuarios que fue encontrada la causa
 *              FechaEstDia:
 *                  type: string
 *                  description: fecha consulta estado diario en PJUD dd/mm/yyyy
 *              updated_at:
 *                  type: string
 *                  description: fecha ultima actualizacion yyyy-mm-dd
 *          example:
 *              uuid: "aaaa-bbbb-cccc-dddd"
 *      Response:
 *          type: object
 *          properties:
 *              status:
 *                  type: number
 *                  description: status OK
 *              msg:
 *                  type: string
 *                  description: mensaje de OK
 *              data:
 *                  type: array
 *                  description: Array de OK
 *                  items:
 *                      type: object
 *                      $ref: '#components/schemas/Causa'
 *          example:
 *              status: 200
 *              msg: "OK"
 *              data: [ { uuid: "aaaa-bbbb-cccc-dddd" } ]
 */

/**
 * @swagger
 * /api/estado_diario/obtener_estado:
 *  post:
 *      summary: permite obtener el estado diario de causas
 *      tags: [User,Response,Error]
 *      requestBody:
 *          required: true
 *          content:
 *              application/json:
 *                  schema:
 *                      type: object
 *                      $ref: '#components/schemas/User'
 *      responses:
 *          200:
 *              description: obtiene las causas diarias
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          $ref: '#components/schemas/Response'
 *          500:
 *              description: Error
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          $ref: '#components/schemas/Error'
 */
router.post("/obtener_estado", async(req, res) => {
    const peticion = req.body;

    if (!peticion.usuario || peticion.usuario.length == 0) {
        res.json({
            status: 3011,
            msg: "nombre de usuario es obligatorio",
            data: []
        })
        return;

    }

    if (!peticion.password || peticion.password.length == 0) {
        res.json({
            status: 3012,
            msg: "contraseña es obligatorio",
            data: []
        })
        return;
    }

    const receptor = peticion.receptor ? true : false;
    let fechas = [];
    if (peticion.fecha) {
        fechas.push(formatDate(sumarDias(new Date(parseInt(peticion.fecha.split(config.separatorDate)[2]), parseInt(peticion.fecha.split(config.separatorDate)[1]) - 1, parseInt(peticion.fecha.split(config.separatorDate)[0])), 0), config.separatorDate));
    } else {
        let a = [{ day: 'numeric' }, { month: 'numeric' }, { year: 'numeric' }];
        if (new Date().getDay() === 1) {
            fechas.push(formatDate(sumarDias(new Date(), -3), config.separatorDate));
            fechas.push(formatDate(sumarDias(new Date(), -2), config.separatorDate));
        } else if (new Date().getDay() === 0) {
            peticion.fecha = formatDate(sumarDias(new Date(), -2), config.separatorDate);
            fechas.push(peticion.fecha);
            peticion.fecha = formatDate(sumarDias(new Date(), -1), config.separatorDate);
            fechas.push(peticion.fecha);
        } else {
            peticion.fecha = formatDate(sumarDias(new Date(), -1), config.separatorDate);
            fechas.push(peticion.fecha);
        }
    }

    const start = process.hrtime();
    console.log('iniciando proceso carga estado diario usuario:', peticion.usuario);

    puppeteer.use(hidden());
    let browser = await puppeteer.launch({
        ignoreHTTPSErrors: true,
        executablePath: executablePath(),
        ...config.launchConf
    });

    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setDefaultTimeout(config.timeout);
    await page.setDefaultNavigationTimeout(config.timeout);

    await page.setViewport({
        width: 1920,
        height: 1280,
        deviceScaleFactor: 1,
    });

    try {
        let causas = [];

        for await (const fecha of fechas) {

            peticion.fecha = fecha;
            console.log('iniciando carga principal usuario:', peticion.usuario);
            await cargaPaginaPrincipal(page);
            console.log('recorriendo causas estado diario usuario:', peticion.usuario);
            const rows = (await page.evaluate(() => { return Array.from(document.querySelectorAll('#verDetalleEstDiaCivil > tr')) })).length;

            let paginas = 0;
            if (rows > 1) {

                let obj = await obtenerCausas(page, peticion.usuario, true, fecha);
                causas = obj.causas;
                paginas = obj.paginas;
                causaTitle = obj.causaTitle;

                //await page.setDefaultTimeout(config.maxTimeout);
                //await page.setDefaultNavigationTimeout(config.maxTimeout);

                let causasfilter = await getCausasBD(causas, receptor);
                const causasdiff = [];
                for await (const causa of causas) {
                    let bus = causasfilter.filter(c => c.Rol === causa.Rol && c.Fecha === causa.Fecha && c.Caratulado === causa.Caratulado && c.Tribunal === causa.Tribunal);
                    if (!bus) {
                        causasdiff.push(causa);
                    }
                }

                causas = await getCausasModal(page, causasfilter, paginas, peticion.usuario, fecha);

                causas = causas.concat(causasdiff);

                await deepReplace(causas, 'url');

            }

        }

        const end = parseHrtimeToSeconds(process.hrtime(start))
        console.info(`Tiempo de ejecución ${end} ms`);

        await page.evaluate(function() {
            salir();
        });
        await browser.close();
        res.json({
            status: 200,
            msg: `OK`,
            data: causas
        })

    } catch (error) {
        console.log("error en principal:", error.message ? error.message : error);
        if (page) {
            await page.screenshot({ path: './error.png' })
            if (page.url() != config.targeturi) {
                await page.evaluate(function() {
                    salir();
                });
            }
        }
        if (browser) {
            await browser.close();
        }
        res.status(500).json({
            status: 500,
            msg: `Error`,
            data: error.message ? error.message : error
        });
    }


    async function obtenerCausas(page, usuario, insert, fecha) {
        let causas = [];
        let causaTitle = await titulosCausas(page);
        let { cantCausas, paginas } = await cantidadPaginas(page);

        console.log('cantidad de paginas:', paginas);
        console.log('cantidad de causas:', cantCausas);

        let result = [];
        if (paginas === 1) {
            console.log("pagina:", paginas, "de:", paginas);

            result = await getCausas(page, causaTitle, paginas, fecha);

            causas = causas.concat(result);
            if (insert) {
                await insertUpdateCausas(causas, usuario);
            }
        } else {
            console.log("pagina:", 1, "de:", paginas);
            for await (let num of asyncGenerator(paginas)) {
                try {
                    console.log('obtenerCausas getCausas 1');
                    result = await getCausas(page, causaTitle, num, fecha);
                    if (insert) {
                        await insertUpdateCausas(result, usuario);
                    }
                    causas = causas.concat(result);
                    await page.waitForSelector('#verDetalleEstDiaCivil > tr:nth-child(' + (result.length + 1) + ') > td > nav > ul');
                    await page.evaluate(async(num) => {
                        pagina(num + 1, 3);
                    }, num);
                    await timeout(1000);
                    console.log('cargando proxima pagina 2');
                    result = await loop(page, causaTitle, num, fecha);
                } catch (error) {
                    console.log("error obtenerCausas:", error);
                    await page.screenshot({ path: './error.png', fullPage: true });
                    throw error;
                }
                console.log("pagina:", num + 1, "de:", paginas);

            }
            if (insert) {
                await insertUpdateCausas(result, usuario);
            }
            causas = causas.concat(result);
        }

        console.log('causas resultantes:', causas.length);

        if (cantCausas != causas.length) {
            throw Error("no se cargaron todas las causas");
        }
        return { causas: causas, paginas: paginas, causaTitle: causaTitle };
    }

    async function cargaPaginaPrincipal(page) {
        let reintento = 0;
        let mensaje = "";
        while (true) {
            try {
                console.log('cargando pagina inicial de PJUD');
                await page.goto(config.targeturi, {
                    waitUntil: 'networkidle0',
                });

                await validateLogin(page);
                await page.waitForSelector('#verDetalleEstDiaCivil > tr');
                break;
            } catch (error) {
                console.log("error de clave:::", error);
                if (error === 'Usuario o clave incorrectas.') {
                    mensaje = error;
                    break;
                }
                reintento++;
                if (reintento > 3) {
                    break;
                } else {
                    await timeout(1000);
                    continue;
                }

            }
        }
        if (mensaje === 'Usuario o clave incorrectas.') {
            throw Error(mensaje);
        }
        if (reintento > 3) {
            throw Error("no se pudo conectar")
        }
    }

    async function insertUpdateCausas(causas, usuario) {
        try {
            let ret = []
            for await (const causa of causas) {

                let bus = await causaModel.findOne({ Rol: causa.Rol, Caratulado: causa.Caratulado, Tribunal: causa.Tribunal });
                if (bus) {
                    causa.usuarios = Array.from(bus['usuarios']);
                }
                if (!causa.usuarios || causa.usuarios.length === 0) {
                    causa.usuarios = [];
                    causa.usuarios.push(usuario);
                    ret.push(causa);
                } else {
                    if (!causa.usuarios.find(u => u === usuario)) {
                        causa.usuarios.push(usuario);
                    }
                    ret.push(causa);
                }
            }
            const causaUpdate = ret.map(causa => ({
                updateOne: {
                    filter: {
                        Rol: causa.Rol,
                        Caratulado: causa.Caratulado,
                        Tribunal: causa.Tribunal
                    },
                    update: {
                        $set: causa,
                        $setOnInsert: {
                            created_at: Date.now()
                        }
                    },
                    upsert: true
                }
            }));

            return await causaModel.bulkWrite(causaUpdate);
        } catch (error) {
            console.log("error en insertUpdateCausas:", error);
        }
    }

    async function deleteDoctos(doctos) {
        const doctoDelete = doctos.map(docto => ({
            deleteMany: {
                filter: {
                    Rol: docto.Rol,
                    Caratulado: docto.Caratulado,
                    Tribunal: docto.Tribunal
                }
            }
        }));

        return await doctoModel.bulkWrite(doctoDelete);
    }

    async function insertUpdateDoctos(doctos, usuario) {
        let ret = []
        for await (const docto of doctos) {
            let bus = await doctoModel.findOne({ Rol: docto.Rol, Caratulado: docto.Caratulado, Tribunal: docto.Tribunal });
            if (bus) {
                docto.usuarios = Array.from(bus['usuarios']);
            }

            if (!docto.usuarios || docto.usuarios.length === 0) {
                docto.usuarios = [];
                docto.usuarios.push(usuario);
                ret.push(docto);
            } else {
                if (!docto.usuarios.find(u => u === usuario)) {
                    docto.usuarios.push(usuario);
                    ret.push(docto);
                }
            }
        }
        const doctoUpdate = ret.map(docto => ({
            updateOne: {
                filter: {
                    uuid: docto.uuid,
                },
                update: {
                    $set: docto,
                    $setOnInsert: {
                        created_at: Date.now()
                    }
                },
                upsert: true
            }
        }));

        return await doctoModel.bulkWrite(doctoUpdate);
    }


    async function getCausasBD(causaspjud) {
        const retorno = [];
        try {

            let yourDate = new Date();
            const offset = yourDate.getTimezoneOffset()
            yourDate = new Date(yourDate.getTime() - (offset * 60 * 1000))
            let fechaAct = yourDate.toISOString().split('T')[0];
            let consulta = {};
            if (!receptor) {
                consulta = {
                    "$where": "this.updated_at.toJSON().slice(0, 10) != '" + fechaAct + "'"
                };
            }

            const causas = await causaModel.find(consulta);

            for await (const causa of causas) {
                let bus = causaspjud.find(c => c.Rol === causa.Rol && c.Fecha === causa.Fecha && c.Caratulado === causa.Caratulado && c.Tribunal === causa.Tribunal);
                if (bus) {
                    retorno.push({ Detalle: causa.Detalle, Rol: causa.Rol, Fecha: causa.Fecha, Caratulado: causa.Caratulado, Tribunal: causa.Tribunal });
                }
            }
            return retorno;
        } catch (error) {
            console.log("error getCausasBD:", error);
            throw error;
        }
    }

    async function validateLogin(page) {
        if (page.url() === config.targeturi) {
            try {
                console.log('ingresando login PJUD');
                await loginEstadoDiario(page);
            } catch (error) {
                throw error;
            }
            console.log('consulta estado diario');
            await loadEstadoDiario(page);
            console.log('consulta estado diario causas civiles');
            await consultaEstadoDiario(page);
            return false;
        }
        return true;
    }

    async function loginEstadoDiario(page) {
        return new Promise(async(resolve, reject) => {
            await timeout(1000);
            await page.keyboard.press('Escape');
            await timeout(1000);
            await page.waitForSelector('#page-wrapper > section.banner > div > div.container.hidden-xs > div > div:nth-child(1) > div > button:nth-child(1)');
            await page.click('#page-wrapper > section.banner > div > div.container.hidden-xs > div > div:nth-child(1) > div > button:nth-child(1)');

            await page.waitForSelector('#btnSegClave')
            await page.click('#btnSegClave')
            await timeout(2000);

            await page.waitForSelector('#rut');
            await page.focus('#rut');
            await page.keyboard.type(peticion.usuario);

            await page.waitForSelector('#password')
            await page.focus('#password');
            await page.keyboard.type(peticion.password);

            await page.waitForSelector('#btnSegundaClaveIngresar')
            await page.click('#btnSegundaClaveIngresar')
            page.on('dialog', async dialog => {
                console.log(dialog.message()); 
                await dialog.accept();
                reject(dialog.message());
            })
            await timeout(1000);
            resolve("ok");

        });
    };

    async function loadEstadoDiario(page) {
        let reintento = 0;
        while (true) {
            try {
                await page.waitForXPath('//*[@id="sidebar"]/ul/li[4]/a');
                const elements = await page.$x('//*[@id="sidebar"]/ul/li[4]/a');
                await elements[0].click();

                await page.waitForSelector('#nuevocolapsador > li:nth-child(3) > a');
                await page.click('#nuevocolapsador > li:nth-child(3) > a');
                try {
                    await page.waitForSelector("#loadPreEstDiaCivil");
                    await page.waitForSelector("#loadPreEstDiaCivil", {
                        hidden: true
                    });
                } catch (error) {

                }
                break;
            } catch (error) {
                reintento++;
                if (reintento > 3) {
                    console.log('error loadEstadoDiario:'.error);
                    await page.screenshot({ path: './error.png', fullPage: true });
                    throw error;
                }
            }
        }
    }

    async function consultaEstadoDiario(page) {

        await page.waitForSelector('#fechaEstDiaCiv');
        const valor = await page.$eval("#fechaEstDiaCiv", (input) => {
            return input.getAttribute("value")
        })
        if (valor != peticion.fecha) {
            await page.$eval('#fechaEstDiaCiv', el => el.value = '');
            try {
                await page.waitForSelector("#loadPreEstDiaCivil");
                await page.waitForSelector("#loadPreEstDiaCivil", {
                    hidden: true
                })
            } catch (error) {

            }
            await page.waitForSelector('#btnConsultaEstDiaCivil', { visible: true });

            await page.click('#btnConsultaEstDiaCivil');
            try {
                await page.waitForSelector("#loadPreEstDiaCivil");
                await page.waitForSelector("#loadPreEstDiaCivil", {
                    hidden: true
                })
            } catch (error) {

            }
            await page.waitForSelector('#fechaEstDiaCiv', { visible: true });
            await page.type('#fechaEstDiaCiv', peticion.fecha, { delay: 10 });
            try {
                await page.waitForSelector("#loadPreEstDiaCivil");
                await page.waitForSelector("#loadPreEstDiaCivil", {
                    hidden: true
                });
            } catch (error) {

            }
            await page.waitForSelector('#btnConsultaEstDiaCivil', { visible: true });
            await page.click('#btnConsultaEstDiaCivil');
        }

        try {
            await page.waitForSelector("#loadPreEstDiaCivil");
            await page.waitForSelector("#loadPreEstDiaCivil", {
                hidden: true
            });
        } catch (error) {

        }
    }

    async function refreshDetalle(page, usuario, dataRows, result, fecha) {
        let { causas } = await obtenerCausas(page, usuario, false, fecha);

        const retorno = [];
        for await (let causa of result) {
            let procesado = dataRows.filter(c => c.Rol === causa.Rol && c.Caratulado === causa.Caratulado && c.Tribunal === causa.Tribunal);
            let detalle = causas.filter(c => c.Rol === causa.Rol && c.Caratulado === causa.Caratulado && c.Tribunal === causa.Tribunal);
            if (detalle.length > 0 && procesado.length === 0) {
                causa.Detalle = detalle[0].Detalle;
                retorno.push(causa);
            }
        }

        return retorno;
    }

    async function getCausasModal(page, result, paginas, usuario, fecha) {
        let dataRows = []
        let i = 1;
        const total = result.length;
        while (true) {
            let reload = false;
            for await (const causa of result) {
                await validateLogin(page);
                console.log('procesando causa ', i, ' de ', total, ' detalle ', causa);
                await deleteDoctos([causa]);
                const modalContent = await openRowModal(causa, usuario, fecha);
                if (modalContent === "Causa No Disponible") {
                    throw Error("Causa No Disponible");
                }
                if (modalContent.length === 0) {
                    reload = true;
                    break;
                }
                modalContent.updated_at = Date.now();
                await insertUpdateCausas([modalContent], usuario);
                dataRows.push(modalContent)
                i++;
            }
            if (reload) {
                await page.evaluate(() => {
                    location.reload(true)
                });
                await loadEstadoDiario(page);
                await consultaEstadoDiario(page);
                result = await refreshDetalle(page, paginas, dataRows, result, fecha);
                continue;
            }
            break;
        }
        return dataRows;
    }

    async function loop(page, causaTitle, num, fecha) {
        let retorno = [];
        let reintento = 0;
        while (true) {
            try {
                try {
                    await page.waitForSelector('#verDetalleEstDiaCivil > tr');
                    const causasPagina = (await page.evaluate(() => { return Array.from(document.querySelectorAll('#verDetalleEstDiaCivil > tr')) })).length;
                    //const causasPagina = await page.$$eval('#verDetalleEstDiaCivil > tr', el => el.length);
                    await page.waitForSelector('#verDetalleEstDiaCivil > tr:nth-child(' + causasPagina + ') > td > nav > div > b');
                    if (causasPagina > 1) {
                        let pagina = '0';
                        let element = await page.$('#verDetalleEstDiaCivil > tr:nth-child(' + causasPagina + ') > td > nav > ul > li.page-item.active > span')
                        if (element) {
                            pagina = await page.evaluate(el => el.textContent, element)
                            if (parseInt(pagina) === (num + 1)) {
                                console.log('loop obtener causas 1');
                                retorno = await getCausas(page, causaTitle, num, fecha);
                                break;
                            } else {
                                console.log('continue loop obtener causas 3');
                                continue;
                            }
                        } else {
                            if (causasPagina < 15) {
                                console.log('loop obtener causas 4');
                                retorno = await getCausas(page, causaTitle, num, fecha);
                                break;
                            } else {
                                console.log('continue loop obtener causas 5');
                                continue;
                            }
                        }

                    }
                } catch (error) {
                    console.log("error en loop 1:", error);
                    await page.screenshot({ path: './error.png', fullPage: true });
                    if (page.url() === config.targeturi) {
                        console.log("error en loop 2:", page.url());
                        throw error;
                    }
                    continue;
                }
            } catch (error) {
                console.log("error en loop 3:", error);
                await page.screenshot({ path: './error.png', fullPage: true });
                reintento++;
                if (reintento > 3) {
                    throw error;
                }
                if (!await validateLogin(page)) {
                    try {
                        await page.waitForSelector('#verDetalleEstDiaCivil > tr');
                        //const causasPagina = await page.$$eval('#verDetalleEstDiaCivil > tr', el => el.length);
                        const causasPagina = (await page.evaluate(() => { return Array.from(document.querySelectorAll('#verDetalleEstDiaCivil > tr')) })).length;
                        await page.waitForSelector('#verDetalleEstDiaCivil > tr:nth-child(' + causasPagina + ') > td > nav > ul');
                        await page.evaluate(async(num) => {
                            pagina(num + 1, 3);
                        }, num);
                        await timeout(1000);
                        console.log('cargando proxima pagina 3');
                        continue;
                    } catch (error) {
                        console.log("error en loop 4:", error);
                        await page.screenshot({ path: './error.png', fullPage: true });
                        reintento++;
                        if (reintento > 3) {
                            throw error;
                        } else {
                            continue;
                        }
                    }
                };
            }
        }
        return retorno;
    }

    async function timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function* asyncGenerator(paginas) {
        let i = 1;
        while (i < paginas) {
            yield i++;
        }
    }

    async function getCausas(page, causaTitle, num, fecha) {
        try {
            let result = [];
            let reintento = 0;
            while (true) {
                try {
                    try {
                        await page.waitForSelector("#loadPreEstDiaCivil");
                        await page.waitForSelector("#loadPreEstDiaCivil", {
                            hidden: true
                        });
                    } catch (error) {

                    }

                    await page.waitForSelector('#verDetalleEstDiaCivil > tr');
                    result = await page.$$eval('#verDetalleEstDiaCivil > tr', rows => {
                        return Array.from(rows, row => {
                            const columns = row.querySelectorAll('td');
                            return Array.from(columns, col => {
                                const link = col.querySelector("a")
                                if (link) {
                                    return link.getAttribute("onclick")
                                } else {
                                    return col.innerText.trim()
                                }
                            })
                        });
                    });
                    break;
                } catch (error) {
                    console.log("error en getCausas 1:", error);
                    await page.screenshot({ path: './error.png', fullPage: true });
                    reintento++;
                    if (reintento > 3) {
                        console.log('ya probo 3 veces que no cargo 1');
                        throw error;
                    }
                    try {
                        if (!await validateLogin(page)) {
                            try {
                                console.log('volvio a cargar pagina de inicio');
                                await page.waitForSelector('#verDetalleEstDiaCivil > tr');
                                //const causasPagina = await page.$$eval('#verDetalleEstDiaCivil > tr', el => el.length);
                                const causasPagina = (await page.evaluate(() => { return Array.from(document.querySelectorAll('#verDetalleEstDiaCivil > tr')) })).length;
                                await page.waitForSelector('#verDetalleEstDiaCivil > tr:nth-child(' + causasPagina + ') > td > nav > ul');
                                await page.evaluate(async(num) => {
                                    pagina(num + 1, 3);
                                }, num);
                                await timeout(1000);
                                console.log('cargando proxima pagina 1');
                                continue;
                            } catch (error) {
                                console.log("error en getCausas 2:", error);
                                await page.screenshot({ path: './error.png', fullPage: true });
                                reintento++;
                                if (reintento > 3) {
                                    console.log('ya probo 3 veces que no cargo 2');
                                    throw error;
                                }
                            }
                        } else {
                            console.log('volvio a la pagina a esperar que cargue');
                            continue;
                        }
                    } catch (error) {
                        console.log("error en getCausas 3:", error);
                        await page.screenshot({ path: './error.png', fullPage: true });
                        throw error;
                    }

                }
            }

            if (result[result.length - 1] && result[result.length - 1].length < 5) {
                result.splice(result.length - 1);
            }
            let causas = [];

            for await (const row of result) {
                let causa = {};
                for await (const [i, title] of causaTitle.entries()) {
                    causa[title] = row[i];
                }
                causa.uuid = uuidv4();
                causa.FechaEstDia = fecha;
                causas.push(causa);
            }
            return causas;
        } catch (error) {
            console.log("error en getCausas 4:", error);
            await page.screenshot({ path: './error.png', fullPage: true })
            throw error;
        }

    }

    async function openRowModal(row, usuario, fecha) {
        try {
            let expirado = false;
            let intentos = 0;

            const modalSelector = '#modalDetalleEstDiaCivil';

            while (true) {
                try {
                    await page.evaluate(`${row['Detalle']}`);

                    try {
                        await page.waitForSelector(".imgLoad", {
                            hidden: true
                        })
                    } catch (error) {

                    }

                    try {
                        await page.waitForSelector(`${modalSelector} .tab-content table tr`, {
                            visible: true
                        });

                    } catch (error) {
                        for (let cont = 1; cont <= 3; cont++) {
                            try {
                                await page.waitForSelector('body > div.sweet-alert.showSweetAlert.visible > p', { timeout: 1000 });
                                let element = await page.$('body > div.sweet-alert.showSweetAlert.visible > p');
                                let value = await page.evaluate(el => el.textContent, element);
                                if (value === 'El vinculo ha expirado, por favor consulte nuevamente.') {
                                    expirado = true;
                                    return [];
                                }
                                if (value === 'Causa No Disponible.') {
                                    return "Causa No Disponible";
                                }
                            } catch (error) {

                            }
                            await timeout(1000);
                        }

                    }

                    if (receptor) {
                        await timeout(1000);

                        await page.waitForSelector(`#modalDetalleEstDiaCivil > div > div > div.modal-body > div > div:nth-child(2) > table > tbody > tr > td:nth-child(2) > a > i`, {
                            visible: true
                        });

                        await page.click(`#modalDetalleEstDiaCivil > div > div > div.modal-body > div > div:nth-child(2) > table > tbody > tr > td:nth-child(2) > a > i`);

                        await timeout(1000);
                        const modalReceptor = '#modalReceptorCivil';

                        let receptores = await getReceptores(modalReceptor);

                        await timeout(1000);

                        await page.waitForSelector(`${modalReceptor} > div > div > div.modal-footer > button`, {
                            visible: true
                        });

                        await page.click(`${modalReceptor} > div > div > div.modal-footer > button`);

                        row['receptores'] = receptores;

                        await timeout(1000);
                    }


                    let cuaderno = await getModalCombo(modalSelector, row, usuario);

                    if (receptor) {
                        await timeout(1000);
                    }

                    await page.waitForSelector(`${modalSelector} > div > div > div.modal-footer > button`, {
                        visible: true
                    });

                    await page.click(`${modalSelector} > div > div > div.modal-footer > button`);

                    row['cuadernos'] = cuaderno;

                    row['FechaEstDia'] = fecha;

                    delete row['Detalle'];

                    break;
                } catch (error) {
                    await page.screenshot({ path: './error.png', fullPage: true });
                    while (true) {
                        try {
                            await validateLogin(page);
                            break;
                        } catch (err) {
                            await page.screenshot({ path: './error.png', fullPage: true });
                            intentos++;
                            if (intentos > 3) {
                                break;
                            }
                        }
                    }
                }
                if (intentos > 3) {

                    break;
                }

            }
            if (intentos > 3) {
                throw "nunca cargo";
            }

            return row || [];
        } catch (error) {
            await page.screenshot({ path: './error.png', fullPage: true })
                //console.log("error en causa:", row, "error:", error);
            throw error;
            //await page.screenshot({ path: './error.png', fullPage: true })
            //await browser.close();
            //res.json({
            //    status: 3017,
            //    msg: `OK`,
            //    data: error.message
            //})

        }
        //finally {
        //    return;
        //}

    }

    async function getReceptores(modal) {

        let receptores = [];

        try {
            await page.waitForSelector(".imgLoad", {
                hidden: true
            })
        } catch (error) {

        }

        try {
            await page.waitForSelector(`${modal} > div > div > div.modal-body > div > div > div > center > div`, {
                visible: true,
                timeout: 5000
            });
            return receptores;
        } catch (error) {
            await page.waitForSelector(`${modal} > div > div > div.modal-body > div > div > div > table > tbody > tr`, {
                visible: true,
                timeout: 5000
            });

            const titleReceptores = await titulosReceptores(page);
            let rowsReceptores = await page.$$eval(`${modal} > div > div > div.modal-body > div > div > div > table > tbody > tr`, rows => {
                return Array.from(rows, row => {
                    const columns = row.querySelectorAll('td');
                    return Array.from(columns, col => {
                        return col.innerText.trim()
                    })
                });
            });

            for await (const receptor of rowsReceptores) {
                let obj = {};
                for await (const [i, title] of titleReceptores.entries()) {
                    obj[title] = receptor[i];
                }
                if (Object.values(obj).length > 1) {
                    receptores.push(obj);
                }
            }
            return receptores;
        }

    }

    async function getModalCombo(modalSelector, detcausa, usuario) {

        try {
            let opt = 0
            let selector = []
            let totalOptions = []
            do {
                let optSelcted
                let optionsTabs

                const comboSelector = `${modalSelector} select option`
                await page.waitForSelector(`${modalSelector}`, {
                    visible: true
                });

                selector = await page.$$eval(comboSelector, options => {
                    return Array.from(options, option => {
                        return {
                            label: option.innerHTML.trim(),
                            value: option.getAttribute("value"),
                        }
                    })
                })

                if (selector.length >= 1) {
                    optSelcted = selector[opt]
                }

                if (selector.length > 1) {
                    await page.waitForSelector(`${modalSelector} select `, {
                        visible: true
                    });

                    await page.select(`${modalSelector} select `, optSelcted.value)
                    try {
                        await page.waitForSelector(".imgLoad", {
                            hidden: true
                        })
                    } catch (error) {

                    }
                }

                await page.waitForSelector(`${modalSelector} .tab-content table tr`, {
                    visible: true
                })

                const tabsSelector = `${modalSelector} .modal-content .modal-body .tab-content .tab-pane`
                const tabContent = await page.$$eval(tabsSelector, panes => {
                    return Array.from(panes, pane => {
                        const rowstitle = pane.querySelectorAll("table thead tr");
                        const datatitle = Array.from(rowstitle, row => {
                            const cols = row.querySelectorAll("th");
                            return Array.from(cols, col => {
                                return col.textContent.trim()
                            })
                        })
                        const rows = pane.querySelectorAll("table tbody tr");
                        const data = Array.from(rows, row => {
                            const cols = row.querySelectorAll("td");
                            return Array.from(cols, col => {
                                const docs = col.querySelectorAll("form");
                                if (docs.length > 0) {
                                    const pdfs = [];

                                    docs.forEach(doc => {
                                        const url = doc.getAttribute("action");
                                        const name = doc.querySelector("input").name;
                                        const pdf = doc.querySelector("input").value;
                                        pdfs.push({ url: url + "?" + name + "=" + pdf });
                                    })
                                    return pdfs;
                                } else {
                                    const texto = col.textContent.trim()
                                    return texto
                                }
                            })
                        })

                        return {
                            tab: pane.getAttribute("id"),
                            data,
                            datatitle
                        }
                    })
                })

                let tabs = {};
                for await (const tab of tabContent) {
                    let causas = [];
                    for await (const row of tab.data) {
                        let causa = {};
                        for await (const [i, title] of tab.datatitle[0].entries()) {
                            if (title === 'Doc.') {
                                let pdfs = [];
                                for await (const doc of row[i]) {
                                    //pdfs.push({ url: config.url + doc.url });
                                    let uuid = uuidv4();
                                    let base64encoding = await getBase64FromUrl(config.url + doc.url);
                                    let doctos = [];
                                    let docto = { uuid: uuid, url: config.url + doc.url, contentype: base64encoding.split('|')[0], base64: base64encoding.split('|')[1], Rol: detcausa.Rol, Caratulado: detcausa.Caratulado, Tribunal: detcausa.Tribunal, usuario: usuario };
                                    docto.updated_at = Date.now();
                                    doctos.push(docto)
                                    await insertUpdateDoctos(doctos, usuario);
                                    pdfs.push({ uuid: uuid, url: config.url + doc.url })
                                }
                                causa[title] = pdfs;
                            } else {
                                causa[title] = row[i];
                            }
                        }
                        causas.push(causa);
                    }
                    tabs[tab.tab] = causas;
                }

                if (selector.length >= 1) {
                    optionsTabs = {
                        cuaderno: optSelcted != undefined ? optSelcted.label : "no encontrado",
                        //data: tabContent
                        data: tabs
                    }
                } else {
                    optionsTabs = {
                        //data: tabContent
                        data: tabs
                    }
                }
                totalOptions.push(optionsTabs);
                opt++
            } while (opt < selector.length);

            return totalOptions;
        } catch (error) {
            await page.screenshot({ path: './error.png', fullPage: true })
            throw error;

        }

    }

    async function deepReplace(obj, keyName) {
        obj.forEach(async key => {
            if (key === 'cuadernos') {
                delete obj['cuadernos'];
            }
            if (key === 'receptores') {
                delete obj['receptores'];
            }
            if (key === keyName) {
                delete obj['contentype'];
                delete obj['base64'];
                delete obj['url'];
            } else if (Array.isArray(obj[key])) {
                obj[key].forEach(async member => await deepReplace(member, keyName));
            } else if (typeof obj[key] === "object") {
                await deepReplace(obj[key], keyName);
            }
        });
    };

    async function getBase64FromUrl(url) {
        return new Promise(async(resolve, reject) => {
            https.get(url, (resp) => {
                let data = '';
                resp.setEncoding('base64');
                data += resp.headers["content-type"] + '|';
                resp.on('data', (base64) => {
                    data += base64;
                });
                resp.on('end', () => {
                    resolve(data);
                });
            }).on('error', (e) => {
                reject(e);
            });
        });
    }

    async function cantidadPaginas(page) {

        //const causas = await page.$$eval('#verDetalleEstDiaCivil > tr', el => el.length);
        const causas = (await page.evaluate(() => { return Array.from(document.querySelectorAll('#verDetalleEstDiaCivil > tr')) })).length;
        let paginas = 0;
        let cantCausas = 0;
        if (causas > 1) {
            await page.waitForSelector('#verDetalleEstDiaCivil > tr:nth-child(' + causas + ') > td > nav > div > b');
            let element = await page.$('#verDetalleEstDiaCivil > tr:nth-child(' + causas + ') > td > nav > div > b')
            cantCausas = await page.evaluate(el => el.textContent, element)
            paginas = Math.trunc(cantCausas / 15) + 1;

        }
        return { cantCausas: cantCausas, paginas: paginas };
    }

    function parseHrtimeToSeconds(hrtime) {
        var seconds = (hrtime[0] + (hrtime[1] / 1e9)).toFixed(3);
        return seconds;
    }

    function formatDate(date, s) {
        return [
            padTo2Digits(date.getDate()),
            padTo2Digits(date.getMonth() + 1),
            date.getFullYear(),
        ].join(s);
    }

    function padTo2Digits(num) {
        return num.toString().padStart(2, '0');
    }

    function sumarDias(fecha, dias) {
        fecha.setDate(fecha.getDate() + dias);
        return fecha;
    }

    async function titulosCausas(page) {
        await page.waitForSelector('#thTableEstDiaCivil > tr', { visible: true });
        const titleLength = await page.$$eval('#thTableEstDiaCivil > tr > th', el => el.length);
        let titles = [];

        if (titleLength > 1) {
            titles.push('Detalle');
            for (let i = 2; i <= titleLength; i++) {
                titles.push(await page.evaluate(el => el.innerText, await page.$(`#thTableEstDiaCivil > tr > th:nth-child(${i})`)));
            }
        }
        return titles;
    }

    async function titulosReceptores(page) {
        await page.waitForSelector('#modalReceptorCivil > div > div > div.modal-body > div > div > div > table > thead > tr', { visible: true });
        const titleLength = await page.$$eval('#modalReceptorCivil > div > div > div.modal-body > div > div > div > table > thead > tr > th', el => el.length);
        let titles = [];
        for (let i = 1; i <= titleLength; i++) {
            titles.push(await page.evaluate(el => el.innerText, await page.$(`#modalReceptorCivil > div > div > div.modal-body > div > div > div > table > thead > tr > th:nth-child(${i})`)));
        }
        return titles;
    }

})

module.exports = router