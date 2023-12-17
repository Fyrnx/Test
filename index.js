const port = process.env.PORT ?? 6000
let puppeteer = require("puppeteer").default
let http = require("http")
let url = require("url");

let browser = 
puppeteer.launch({
    headless: "new"
}).then(result => { 
    browser = result
})

http.createServer((req,res) => {
    console.log(browser);
    res.end(req.url);
}).listen(port,_ => { 
    console.log(`listing to ${port}`)
})
