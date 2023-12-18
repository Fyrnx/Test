const port = process.env.PORT ?? 6000
let puppeteer = require("puppeteer").default
let http = require("http")
let url = require("url");
const URL = "https://wiki.anidb.net/Main_Page"
let browser 

puppeteer.launch({
    headless: "new"
}).then(result => { 
    browser = result
})

http.createServer(async (req,res) => {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE');


    
    if(browser == undefined) return res.end()
    let page = await browser.newPage()

    try {
        await page.goto(URL, {timeout: 0});
    } catch(err) {}

    let imageSrc = await page.evaluate(_ => { 
        let a = document.querySelector(".mw-wiki-logo")
        return getComputedStyle(a).backgroundImage.match(/http[^"']+/ig)[0]
    })

    console.log(imageSrc);
    res.end(imageSrc)
}).listen(port,_ => { 
    console.log(`listing to ${port}`)
})
