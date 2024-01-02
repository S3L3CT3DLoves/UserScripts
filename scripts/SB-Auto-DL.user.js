// ==UserScript==
// @name         SpankBang AutoDL
// @namespace    https://spankbang.com/
// @version      2.5
// @description  Dashboard to download all a user's videos on SpankBang
// @author       S3L3CT3D
// @match        https://spankbang.com/profile/*/videos
// @icon         https://www.google.com/s2/favicons?sz=64&domain=spankbang.com
// @grant        GM_download
// @grant        GM_addStyle
// @require      https://raw.githubusercontent.com/S3L3CT3DLoves/UserScripts/main/scripts/StashVideoDataType.js
// @require      https://raw.githubusercontent.com/S3L3CT3DLoves/UserScripts/main/scripts/UserScript-Helpers.js
// ==/UserScript==

const TAGS_SELECTOR = "#video > div.left > div.searches > a"
const JSON_SELECTOR = "#container > script[type='application/ld+json']"
const STUDIO_SELECTOR = ""
const DETAILS_SELECTOR = "#video > div.left > div.info > section.details > div > p:nth-child(2)"

const MODAL_HTML = `
<form id="gmPopupContainer" method="dialog">
    <h2>Auto Downloader for SpankBang</h2>
    <section>
        <span id="gmStatus">There are no videos to download</span>
        <button id="gmStartDL" type="submit" disabled>Start Download</button>
        <button id="gmStopDL" type="button" disabled>Stop Downloads</button>
    </section>
    <section>
        <label for="startDate">To limit the download to latest videos, select a date:</label>
        <input type="date" id="startDate" />
    </section>
    <section id="progressBarContainer">
        <div id="underneathBar">
            <div id="progressBar"></div>
        </div>
    </section>
    <section>
        <textarea id="gmLogConsole" rows="10" cols="100"></textarea>
    </section>
    <button id="gmCloseDlgBtn" type="button">Close Popup</button> (Does not stop the downloads)
    <button id="gmClearBtn" type="button">Clear Memory</button>
</form>`

let parser = new DOMParser ();
let links = [];
let allLinks = [];
let prevConsole = "";
let currentDLPromise;
let currentDL;
const studio_name = window.location.pathname.split('/')[2]

function Download(video=VideoData(), url, opt={}, logger = modalConsoleLog) {
	Object.assign(opt, { url, name })

	return new Promise((resolve, reject) => {
        opt.url = url
        opt.name = video.toFileName(false,true,true,".mp4")
		opt.onerror = function (e) {
            console.log(e)
            logger("!!! Download Error - Stopping Downloads !!!")
            stopDownloads()
            reject()
        }
        opt.onload = function () {
            video.downloaded = true
            updateProgressBar(false,0)
            logger("=== " + video.title + " Download Finished ===")
            updateStoredDate(video.date)
            setStoredDownloaded(video.id)
            resolve()
        }
        opt.onprogress = function (p) {
                let percent = Math.round((p.loaded/p.total)*100)
                updateProgressBar(true, percent)
                if( percent %10 == 0 ){
                    logger(video.title + " - Progress: " + percent + "%")
                }
            }

		currentDL = GM_download(opt)
	})
}

function updateStoredDate(date) {
    if(localStorage.getItem(studio_name) != null && date > new Date(localStorage.getItem(studio_name))) {
       return
    }
    localStorage.setItem(studio_name, date)
}

function getStoredDate(){
    return new Date(localStorage.getItem(studio_name) || '2012-01-01')
}

function setStoredDownloaded(vid_id){
    const status = getStoredDownloaded()
    status.push(vid_id)
    localStorage.setItem(studio_name+"_downloads", JSON.stringify(status))
}

function getStoredDownloaded(){
    return JSON.parse(localStorage.getItem(studio_name+"_downloads") || '[]')
}

function clearStorage(){
    localStorage.removeItem(studio_name)
    localStorage.removeItem(studio_name+"_downloads")
    for (const link of allLinks) {
        link.downloaded = false
    }
    filterLinks(getStoredDate)
}

async function getVideoData(url){
    let result = await fetch(url)
    if (!result.ok) {
        if(result.status = 429)
            {
                modalConsoleLog(
                    `=== Too many calls in a short time, hit the SB limit ! ===
                    ==== Please try again in a few minutes ====`)
            }
            else{
                throw Error(result.status)
            }
    }
    let resultText = await result.text()
    const vid_page = parser.parseFromString (resultText, "text/html");
    const vid_elm = vid_page.querySelector('#video')
    const json_data = JSON.parse(vid_page.querySelector(JSON_SELECTOR).textContent)
    const tags = Array.from(vid_page.querySelectorAll(TAGS_SELECTOR)).map((tag) => tag.textContent)
    const details = vid_page.querySelector(DETAILS_SELECTOR).textContent
    return [vid_elm.getAttribute('data-streamkey'),json_data, tags, details]
}

async function getDownloadURL(streamkey){
    const formData = new FormData();
    formData.append("id", streamkey);
    let result = await fetch('https://spankbang.com/api/download',{
            method: 'POST',
            body: formData
        })
    let data = await result.json()
    return data.results.pop().url
}

async function autoDL(){
    document.querySelector("#gmStartDL").disabled = true
    document.querySelector("#gmStopDL").disabled = false
    for (const [i,link] of links.entries()) {
        if (link.downloaded){
            continue
        }
        modalConsoleLog("=== Starting Download (" + (i+1) + " of " + (links.length+1) + ") : " + link.title + " ===")
        downloadText(JSON.stringify(link),'json',link.id + " - " + link.title + ".json")

        // Now download the video
        const dl_link = await getDownloadURL(link.dlKey)
        updateProgressBar(true,0)
        currentDLPromise = Download(link, dl_link, {
            conflictAction : "prompt"
        })
        await currentDLPromise
    }
    document.querySelector("#gmStartDL").disabled = false
    document.querySelector("#gmStopDL").disabled = true
}

function modalConsoleLog(text){
    // Avoid repeating the same message over and over
    if(text == prevConsole) {
        return
    }
    const console = document.querySelector("#gmLogConsole")
    console.value = text + "\n" + console.value
    prevConsole = text
}

function updateStatus(text){
    const status = document.querySelector("#gmStatus")
    status.innerText = text
}

async function parseLinks(){
    modalConsoleLog("Parsing all links in page")
    const allreadyDownloaded = getStoredDownloaded()
    const rawLinks = document.querySelector(".data > .video-list").querySelectorAll(".video-item > .n")
    for (const link of rawLinks) {
        const [key,data,tags, vid_details] = await getVideoData(link.href)
        const videoID = link.href.split('/')[3]
        const video_data = {
            title: data.name,
            date: data.uploadDate,
            tags: tags,
            url: link.href,
            studio: studio_name,
            details: vid_details,
            image: data.thumbnailUrl,
            id: videoID,
            dlKey:key,
            downloaded: allreadyDownloaded.includes(videoID),
            _source: "SB_AutoDLv1"
        }
        allLinks.push(video_data)

        // Throttle parsing otherwise we get 429 errors
        delay(1000)
     }
    // Order array oldest->newest (so we can resume later if we want)
    allLinks = allLinks.sort((a,b) => new Date(a.date) > new Date(b.date) ? 1 : -1)
    // Initialise links to be all links (unfiltered)
    filterLinks(getStoredDate())
}

async function filterLinks(selectedDate){
    links = []
    let alreadyDL = 0
    let matchDate = 0
    for (const link of allLinks) {
        if (link.downloaded){
            alreadyDL++
        }
        if (new Date(link.date) > selectedDate) {
            matchDate++
        }
        if (link.downloaded || new Date(link.date) <= selectedDate) {
            continue
        }
        links.push(link)
    }
    modalConsoleLog("###############")
    modalConsoleLog("#Total Videos: " + allLinks.length)
    modalConsoleLog("#Already DL: " + alreadyDL)
    modalConsoleLog("#Matching date filter: " + matchDate)
    modalConsoleLog("#Total to Download: " + links.length)
    updateStatus("There are " + links.length +" videos to download")
}

async function initModal(dialog){
    document.querySelector("#startDate").addEventListener("blur", setSelectedDate)
    document.querySelector("#startDate").valueAsDate = getStoredDate()
    document.querySelector("#gmCloseDlgBtn").addEventListener('click',() => dialog.close())
    document.querySelector("#gmStartDL").disabled = false
    document.querySelector("#gmStartDL").addEventListener('click',autoDL)
    document.querySelector("#gmStopDL").disabled = true
    document.querySelector("#gmStopDL").addEventListener('click',stopDownloads)
    document.querySelector("#gmClearBtn").addEventListener('click',clearStorage)
}

function stopDownloads() {
    updateProgressBar(false, 0)
    modalConsoleLog("====! ALL DOWNLOADS STOPPED !====")
    currentDL.abort()
    document.querySelector("#gmStartDL").innerText = "Resume Downloads"
    document.querySelector("#gmStartDL").disabled = false
    document.querySelector("#gmStopDL").disabled = true
}

function setSelectedDate(event){
    const selectedDate = event.srcElement.valueAsDate
    filterLinks(selectedDate)
}

function updateProgressBar(show=true, percent=0){
    const container = document.querySelector("#progressBarContainer")
    const progressBar = document.querySelector("#progressBar")
    container.style.display = show ? "block" : "none"
    progressBar.style.width = percent + "%"
}

function createButton(dialog){
    const b = document.createElement('input');
    b.setAttribute('style','position:fixed; top:60px; right:20px; display:block');
    b.setAttribute('id','AutoDL');
    b.setAttribute('type','button');
    b.value = "AutoDL"
    b.addEventListener('click',() => {
        if(allLinks.length == 0){
            parseLinks()
        }
        dialog.showModal()
    })
    document.body.append(b)
}

function main(){
    let dialog = document.createElement('dialog')
    dialog.innerHTML = MODAL_HTML
    document.body.appendChild(dialog)
    initModal(dialog)
    createButton(dialog)
}

//--- CSS for the modal
GM_addStyle ( `
    #gmPopupContainer {
        position:               fixed;
        top:                    20%;
        left:                   20%;
        padding:                2em;
        background:             gray;
        border:                 3px double black;
        border-radius:          1ex;
        z-index:                777;
    }
    #gmPopupContainer button{
        cursor:                 pointer;
        margin:                 1em 1em 1em 1em;
        border:                 1px outset buttonface;
    }
    #gmPopupContainer div{
        margin:                 0.5em 0 0 0;
    }
    #gmPopupContainer #progressBarContainer {
       width: 80%;
       display: none;
    }
    #gmPopupContainer #underneathBar {
       width: 100%;
       background-color: #ddd;
    }
    #gmPopupContainer #progressBar {
       width: 1%;
       height: 30px;
       background-color: #04AA6D;
    }
`);

main()
