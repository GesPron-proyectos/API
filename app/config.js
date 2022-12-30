const config = {
    delay: 1000,
    defTimeout: 0,
    timeout: 30000,
    maxTimeout: 60000,
    url: "https://oficinajudicialvirtual.pjud.cl/",
    targeturi: "https://oficinajudicialvirtual.pjud.cl/home/index.php",
    homeUrl: "https://oficinajudicialvirtual.pjud.cl/indexN.php",
    maxLogin: 10,
    separatorDate: '/',
    version: {
        "status": 200,
        "version": "1.0.0",
        "date": 20221205
    },
    launchConf: {
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-gpu',
            '--disable-site-isolation-trials',
            '--disable-dev-shm-usage'
        ],

    }
}

module.exports = config;