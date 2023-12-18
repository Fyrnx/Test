const port = process.env.PORT ?? 6000
let puppeteer = require("puppeteer").default
let http = require("http")
let url = require("url");
let browser 

puppeteer.launch({
    headless: "new"
}).then(result => { 
    browser = result
})


function wait({selector}) { 
    function waitForSelector(selector) {
        return new Promise(resolve => {
            let result
            let check = _ => {
                let result = document.querySelectorAll(selector)
                if(result && result.length > 0) resolve(result)
            }

            if (check()) {resolve(result)}
    
            const observer = new MutationObserver(mutations => {
                if (check()) {
                    observer.disconnect();
                    resolve(result);
                }
            });
    
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        });
    }

    if(typeof arguments[0] != "object") return waitForSelector(arguments[0])
    if(selector) return waitForSelector(selector)
}

function sleep(ms) { 
    return new Promise((resolve, reject) => {
        setTimeout(_ => resolve("sleeped for " + ms),ms)
    })
}

async function evaluateScripts(url,scripts) {
    if(browser == undefined) return {}
    let page = await browser.newPage()

    try {
        await page.goto(url, {timeout: 0});
    } catch(err) {}
    
    let lastResult
    if(scripts) {
        try { 
            for(let [index,script] of scripts.entries()) {
                scriptResult = await page.evaluate(eval(`async _ => {
                    return await new Promise(async res => { 
                        try {
                            let script = eval(${script});
                            let wait = eval(${wait.toString()});
                            let sleep = eval(${sleep.toString()});
                            let lastResult = ${lastResult != undefined ? `JSON.parse(${lastResult})` : `undefined`}
                            let gotoUrl = url => { 
                                res({
                                    type: "goto",
                                    url
                                })
                            };
                
                            let scriptResult = await script({gotoUrl,wait,sleep})
                            res(scriptResult)
                        } catch(_e) {
                            console.log("from browser",_e)
                            res({
                                type:"error",
                                message:_e.toString()
                            })
                        }
                    })
                }`))
    
                if(scriptResult?.type == "goto" && scriptResult.url) { 
                    let gotoPromise = page.goto(scriptResult.url, {timeout: 0})
                    await Promise.race([
                        gotoPromise,
                        page.waitForSelector("html").then(console.log)
                    ])
                    return
                }

                if(scriptResult?.type == "error") { 
                    console.log(scriptResult);
                    lastResult = JSON.stringify({ 
                        generalType: "error",
                        type: "borwser error",
                        message: scriptResult?.message ?? "unknown error"
                    })
                    break
                }
                 
                if(scriptResult != undefined) lastResult = JSON.stringify(scriptResult);
                else lastResult = scriptResult
            }
        } catch(_e) {
            lastResult = JSON.stringify({
                generalType: "error",
                type: "server error",
                message: _e
            })
        }
    }

    // await page.close()
    return lastResult
};

http.createServer(async (req,res) => {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods', '*');

    let body = []
    req.on("data",chunk => {
        body.push(chunk.toString())
    })
    await new Promise(res => req.on("end",_ => { 
        try {
            body = JSON.parse(body.join(''))
        } catch(_) {}
        res()
    }))

    if(browser == undefined) res.end("failed to get the content")

    let urlParem = req.url.slice(1)
    if(urlParem == undefined) return res.end("url not found")
    let scriptResult = await evaluateScripts(urlParem,body.scripts);

    if(scriptResult != undefined) res.end(scriptResult)
    else res.end(JSON.stringify({}))
}).listen(port)