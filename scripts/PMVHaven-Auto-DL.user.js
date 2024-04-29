// ==UserScript==
// @name         PMVHaven AutoDL
// @namespace    https://pmvhaven.com/
// @version      0.5
// @description  Dashboard to simplify PMV downloading on PMVHaven
// @author       S3L3CT3D
// @match        https://pmvhaven.com/video/*
// @match        https://pmvhaven.com/creator/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=spankbang.com
// @grant        GM_download
// @grant        GM_addStyle
// @require      https://raw.githubusercontent.com/S3L3CT3DLoves/UserScripts/main/scripts/StashVideoDataType.js
// ==/UserScript==

const patternVideo = new URLPattern({ pathname: '/video/*' });
const patternProfile = new URLPattern({ pathname: '/profile/*' });
const patternCreator = new URLPattern({ pathname: '/creator/*' });

const MODE = patternVideo.test(window.location.href) ? "VIDEO" : patternProfile.test(window.location.href) ? "PROFILE" : patternCreator.test(window.location.href) ? "CREATOR" : "ERROR"

const MODAL_HTML = `
<form id="gmPopupContainer" method="dialog">
    <h2>Auto Downloader for PMVHaven</h2>
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
let vids = [];
let allVideos = [];
let prevConsole = "";
let currentDLPromise;
let currentDL;
let studio_name = ""

function delay(milliseconds){
    return new Promise(resolve => {
        setTimeout(resolve, milliseconds);
    });
}

function downloadText(text, fileType, fileName) {
  let blob = new Blob([text], { type: fileType });

  let a = document.createElement('a');
  a.download = fileName;
  a.href = URL.createObjectURL(blob);
  a.dataset.downloadurl = [fileType, a.download, a.href].join(':');
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 1500);
}

function Download(video=VideoData(), url, opt={}, logger = modalConsoleLog) {
	Object.assign(opt, { url, name })

	return new Promise((resolve, reject) => {
        opt.url = url
        opt.name = video.toFileName(true,false,true,".mp4")
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

async function getVideoData(videoID){
    let result = await fetch('https://pmvhaven.com/api/v2/videoInput',{
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            "video": videoID,
            "mode": "InitVideo",
            "view": true
        })
    })
    let data = await result.json()
    return data.video
}

async function autoDL(){
    document.querySelector("#gmStartDL").disabled = true
    document.querySelector("#gmStopDL").disabled = false
    for (const [i,vid] of vids.entries()) {
        if (vid.downloaded){
            continue
        }
        modalConsoleLog("=== Starting Download (" + (i+1) + " of " + vids.length + ") : " + vid.title + " ===")
        downloadText(vid.toString(),"json",vid.toFileName(true,false,true,".json"))

        // Now download the video
        updateProgressBar(true,0)
        currentDLPromise = Download(vid, vid.dlKey, {
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

async function getCreatorLinks(creatorName, index = 1){
    let links = []
    let headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
    if(index == 1){
        let creatorData = await fetch('https://pmvhaven.com/api/v2/search',{
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                "creator": creatorName,
                "mode": "SearchCreator"
            })
        })
        jsonData = await creatorData.json()

        links = jsonData.data
        while(links.length < jsonData.count){
            index = index + 1
            await new Promise(resolve => setTimeout(resolve, 3000));

            let newData = await getCreatorLinks(creatorName, index)
            links.push(...newData.data)

            console.log(links.length)
        }

        return links
    }
    else{
        let creatorData = await fetch('https://pmvhaven.com/api/v2/search',{
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                "creator": creatorName,
                "mode": "SearchMoreCreator",
                "index": index
            })
        })
        return creatorData.json()
    }
}

function generatePMVHavenUrl(title, id){
    cleanTitle = title.replaceAll(/\s/g, "-")
    while(cleanTitle.includes("--")){
        cleanTitle = cleanTitle.replaceAll("--", "-")
    }
    return "https://pmvhaven.com/video/" + cleanTitle + "_" + id
}

async function getAllVideos(){
    modalConsoleLog("Getting all video data")
    studio_name = window.location.pathname.split('/').pop()
    const alreadyDownloaded = getStoredDownloaded()
    let creatorData = await getCreatorLinks(studio_name)

    for (const item of creatorData) {
        let video = new VideoData({source: "PMVH_AutoDLv1"})
        video.title = item.title
        video.dlKey = item.url
        video.id = item._id
        video.studio = item.creator
        video.date = new Date(item.isoDate)
        video.downloaded = alreadyDownloaded.includes(item._id)
        video.url = generatePMVHavenUrl(item.title, item._id)
        // That's all we can get, maybe add more in the future if needed to get a full JSON file

        allVideos.push(video)
     }
    // Order array oldest->newest (so we can resume later if we want)
    allVideos = allVideos.sort((a,b) => a.date > b.date ? 1 : -1)
    console.log(allVideos)
    // Initialise links to be all links (unfiltered)
    filterVideos(getStoredDate())
    console.log(allVideos)
}

async function filterVideos(selectedDate){
    vids = []
    let alreadyDL = 0
    let matchDate = 0
    for (const vid of allVideos) {
        if (vid.downloaded){
            alreadyDL++
        }
        if (new Date(vid.date) > selectedDate) {
            matchDate++
        }
        if (vid.downloaded || new Date(vid.date) <= selectedDate) {
            continue
        }
        vids.push(vid)
    }
    modalConsoleLog("###############")
    modalConsoleLog("#Total Videos: " + allVideos.length)
    modalConsoleLog("#Already DL: " + alreadyDL)
    modalConsoleLog("#Matching date filter: " + matchDate)
    modalConsoleLog("#Total to Download: " + vids.length)
    updateStatus("There are " + vids.length +" videos to download")
}

async function initModal(dialog){
    document.querySelector("#startDate").addEventListener("blur", setSelectedDate)
    document.querySelector("#startDate").valueAsDate = getStoredDate()
    document.querySelector("#gmCloseDlgBtn").addEventListener('click',() => document.querySelector("#AutoDLDialog").close())
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
    filterVideos(selectedDate)
}

function updateProgressBar(show=true, percent=0){
    const container = document.querySelector("#progressBarContainer")
    const progressBar = document.querySelector("#progressBar")
    container.style.display = show ? "block" : "none"
    progressBar.style.width = percent + "%"
}

function buttonClickList(){
     if(allVideos.length == 0){
        getAllVideos()
     }
    document.querySelector("#AutoDLDialog").showModal()
}

async function buttonClickSingleDL(){
    const videoID = window.location.pathname.split('_').pop()
    console.log(videoID)
    let videoData = await getVideoData(videoID)
    videoData = videoData.pop()
    studio_name = videoData.creator

    let video = new VideoData({source: "PMVH_AutoDLv1"})
    video.title = videoData.title
    video.date = videoData.isoDate
    video.studio = studio_name
    video.url = window.location.href
    video.id = videoID
    console.log(video)
    console.log(video.toFileName(true,false,true,".mp4"))
    console.log("Downloading " + video.title)
    
    currentDLPromise = Download(video, videoData.url, {
        conflictAction : "prompt"
    })
    await currentDLPromise
    downloadText(video.toString(),"json",video.toFileName(true,false,true,".json"))
}

function createButton(dialog){
    const b = document.createElement('input');
    b.setAttribute('style','position:fixed; top:60px; right:20px;z-index: 1000; display:block');
    b.setAttribute('id','AutoDL');
    b.setAttribute('type','button');
    b.value = "AutoDL"
    document.body.append(b)
    b.addEventListener('click',() => {
        if (MODE == "CREATOR"){
            // Profile mode will be added later, it messes with the saving of already-dl files
            buttonClickList()
        }
        else if (MODE == "VIDEO"){
            buttonClickSingleDL()
        }
        else{
            console.error("Unknown Mode: " + MODE)
        }
    })
}

function main(){
    let dialog = document.createElement('dialog')
    dialog.setAttribute('id','AutoDLDialog')
    dialog.innerHTML = MODAL_HTML
    document.body.appendChild(dialog)
    studio_name = window.location.pathname.split('/').pop()
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
    #gmPopupContainer #gmLogConsole {
        background-color: white;
        color: black;
     }
`);

main()
