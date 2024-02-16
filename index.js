let express = require('express');
let cors = require('cors');
let multer = require('multer');
let fs = require("fs");
const puppeteerExtra = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');

puppeteerExtra.use(Stealth());

let upload = multer({dest: "uploads/"});
let type = upload.any('file');
let app = express();

let {default: puppeteer,executablePath} = require('puppeteer');

let browser
(async _ => {
    browser = await puppeteer.launch({
        headless: "new",
        timeout: 0,
        executablePath: executablePath(),
    })
})()

async function wait({selector,func,timeout = 0} = {}) { 
    timeout = timeout > 0 ? timeout : 0

    let result
    let selected
    let functionObject = {
        func: null,
        delay: 100
    }
    
    async function waitForSelector(selector) {
        if(typeof selector != "string") return
        return new Promise((resolve,reject) => {
            let timeoutCallBack 

            if(timeout) timeoutCallBack = setTimeout(_ => {
                reject(`timeout (${timeout}ms)`)
            },timeout)

            let result
            let check = _ => {
                result = document.querySelectorAll(selector)
                if(result && result.length > 0) return true
            }

            if (check()) {
                clearTimeout(timeoutCallBack)
                resolve(result)
            }
    
            const observer = new MutationObserver(mutations => {
                if (check()) {
                    observer.disconnect();
                    clearTimeout(timeoutCallBack)
                    resolve(result);
                }
            });
    
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        });
    }

    async function waitForCondition() {
        let {func,delay} = functionObject
        return new Promise((res,reject) => { 
            let timeoutCallBack

            let interval = setInterval(_ => {
                let testResult = func({
                    selected
                })
                if(testResult) {
                    clearInterval(interval)
                    clearTimeout(timeoutCallBack)
                    res(testResult)
                }
            },delay)


            if(timeout) timeoutCallBack = setTimeout(_ => {
                clearInterval(interval)
                reject(`timeout (${timeout}ms)`)
            },timeout)


        })
    }

    function runFunc() { 
        if(typeof func == "function") functionObject.func = func
        else functionObject = {...functionObject,...func}

        return waitForCondition()
    }

    let type = typeof arguments[0]
    if(type != "object") {
        if(type == "string") return waitForSelector(arguments[0])
        if(type == "function") {
            functionObject.func = arguments[0]
            return waitForCondition()
        }
    }

    if(selector != null) {
        selected = await waitForSelector(selector)
        result = selected
    }

    if(func != null) result = { 
        functionResult: await runFunc(),
        selected
    }

    return result
}

function sleep(ms) { 
    return new Promise((resolve, rejectect) => {
        setTimeout(_ => resolve("sleeped for " + ms),ms)
    })
}

function getFile({fileName,mime,convert}) { 
    let results = []
    files.forEach(file => { 
        let {originalname,mimetype} = file.fileInfo
        let [nature,format] = mimetype.split('/')
        
        if(
            fileName == originalname ||
            mime && (mime == mimetype || mime.split('/').some(x => x == nature || x == format)) || 
            fileName == undefined && mime == undefined
        ) {
            results.push(file)
        }
    })

    if(typeof convert == "string" || Array.isArray(convert)) {
        if(typeof convert == "string") convert = [convert]
        results = results.map(file => { 
            let {buffer,base64} = file
            let {originalname,mimetype} = file.fileInfo

            buffer = new Uint8Array(buffer.data).buffer; 
            if(convert.some(type => type.toLowerCase() == "dataurl")) file.dataURL = `data:${mimetype};base64,${base64}`
            if(convert.some(type => type.toLowerCase() == "file")) file.File = new File([buffer],originalname,{type: mimetype})
            if(convert.some(type => type.toLowerCase() == "blob")) file.Blob = new Blob([buffer],{type: mimetype})
            return file
        })
    }

    return results
}

async function read(file,type) { 
    let reader = new FileReader
    
    let readHash = { 
        "buffer": "readAsArrayBuffer",
        "binary": "readAsBinaryString",
        "dataurl": "readAsDataURL",
        "text": "readAsText"
    }

    let readType = readHash[type.toLowerCase()]
    if(!readType) return Error(`${type} isn't an available type`)
    reader[readType](file)

    return new Promise((res) => { 
        reader.addEventListener("load",_ => { 
            res(reader.result)
        })
    })
}

async function evaluateScripts(url,scripts,files) {
    if(browser == undefined) return {}
    let page = await browser.newPage()

    try {
        await Promise.race([
            page.goto(url, {timeout: 0}),
            page.waitForSelector("html")
        ])
    } catch(err) {}
    
    let lastResult
    if(scripts) {
        try {
            let scriptResult
            for(let [index,script] of scripts.entries()) {
                let evalScript = `_ => {
                    return new Promise(async res => { 
                        try {
                            let script = eval(${script});
                            let wait = eval(${wait.toString()});
                            let sleep = eval(${sleep.toString()});
                            let getFile = eval(${getFile.toString()});
                            let readFile = eval(${read.toString()});
                            let lastResult = ${lastResult != undefined ? `JSON.parse(${lastResult})` : `undefined`}
                            let gotoUrl = url => { 
                                res({
                                    type: "goto",
                                    url
                                })
                            };

                            let puppeteerClick = (x,y) => res({type: "click",x,y})
                            let puppeteerInputFile = (file,input) => { 
                                let filePath = file.fileInfo.path
                                input.dataset.file = filePath.replace(/uploads\\\\/,'')
                                res({type: "inputFile",file})
                            }

                            let files = (${JSON.stringify(files)})
                            let scriptResult = await script({gotoUrl,wait,sleep,getFile,readFile,puppeteerClick,puppeteerInputFile})
                            res(scriptResult)
                        } catch(_e) {
                            console.error(_e)
                            res({
                                type:"error",
                                message:_e.toString()
                            })
                        }
                    })
                }`
                let func = eval(evalScript)
                scriptResult = await page.evaluate(func)

                if(scriptResult?.type == "goto" && scriptResult.url) {
                    let gotoPromise = page.goto(scriptResult.url, {timeout: 0})
                    await Promise.race([
                        gotoPromise,
                        page.waitForSelector("html")
                    ])
                    return
                }

                if(scriptResult?.type == "click") { 
                    let {x,y} = scriptResult
                    await page.mouse.click(x || 0,y || 0)
                }

                if(scriptResult?.type == "inputFile") { 
                    let {file} = scriptResult
                    let filePath = file.fileInfo.path
                    let input = await page.$(`input[type=file][data-file="${filePath.replace(/uploads\\/,'')}"]`);
                    let inputingPromise = input.uploadFile(filePath)

                    await Promise.race([
                        inputingPromise,
                        page.waitForSelector("html")
                    ])

                    await sleep(1000)
                }

                if(scriptResult?.type == "error") { 
                    lastResult = JSON.stringify({ 
                        generalType: "error",
                        type: "borwser error",
                        message: scriptResult?.message ?? "unknown error"
                    })
                    break
                }
                 
            }
            if(scriptResult != undefined) lastResult = JSON.stringify(scriptResult);
            else lastResult = scriptResult
        } catch(_e) {
            lastResult = JSON.stringify({
                generalType: "error",
                type: "server error",
                message: _e
            })
        }
    }

    await page.close()
    return lastResult
};

app.use(cors())
app.use(express.json({type: ["text/plain","application/json"]}))
app.use(express.urlencoded({ extended: true }));
app.use(type); 
app.use(express.static('public'));

app.all("*",ServerFunction)
app.listen(2400)

async function ServerFunction(req,res) { 
    if(browser == undefined) res.end("failed to get the content")

    let urlParem = req.url.slice(1)
    if(urlParem == undefined) return res.end("url not found")
    let {scripts,script} = req.body
    let scriptsArray = []
    let files = req.files?.map(file => {
        let {path} = file
        let buffer = fs.readFileSync(path)
        let base64 = buffer.toString("base64")
        return { 
            fileInfo:file,
            buffer,
            base64
        }
    })

    if(scripts) { 
        scriptsArray.push(...eval(`[${scripts}]`))
    } 

    if(script) { 
        if(typeof script == "string") scriptsArray.push(script)
        else scriptsArray.push(...script)
    }

    if(Array.isArray(req.body)) {
        scriptsArray.push(...req.body)
    }

    scriptsArray = scriptsArray.map(script => eval(script))
    
    let scriptResult = await evaluateScripts(urlParem,scriptsArray,files);

    req?.files?.forEach(file => { 
        let {path} = file
        fs.rmSync(path)
    })
    
    if(scriptResult != undefined) res.end(scriptResult)
    else res.end(JSON.stringify({}))
}