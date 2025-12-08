// ==UserScript==
// @name         PMVHaven AutoDL
// @namespace    https://pmvhaven.com/
// @version      2.0
// @description  Dashboard to simplify PMV downloading on PMVHaven
// @author       S3L3CT3D
// @match        https://pmvhaven.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pmvhaven.com
// @grant        GM_download
// @grant        GM_addStyle
// @require      https://raw.githubusercontent.com/S3L3CT3DLoves/UserScripts/main/scripts/StashVideoDataType.js
// ==/UserScript==

const patternVideo = new URLPattern({ pathname: '/video/*' });
const patternProfile = new URLPattern({ pathname: '/profile/*' });

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

let button = null

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
        opt.name = video.toFileName(true,true,true,".mp4")
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

function getStoredDownloaded(studio){
    let s = studio ?? studio_name
    return JSON.parse(localStorage.getItem(s+"_downloads") || '[]')
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
    let result = await fetch('https://pmvhaven.com/api/videos/'+videoID+"/watch-page",{
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    })
    let data = await result.json()
    console.log(data.data)
    return data.data.video
}

async function autoDL(){
    if (vids.length == 0){
        modalConsoleLog("=== Nothing To Download ===")
        return
    }

    document.querySelector("#gmStartDL").disabled = true
    document.querySelector("#gmStopDL").disabled = false
    for (const [i,vid] of vids.entries()) {
        console.log(vid);
        if (vid.downloaded){
            continue
        }
        modalConsoleLog("=== Starting Download (" + (i+1) + " of " + vids.length + ") : " + vid.title + " ===")
        downloadText(vid.toString(),"json",vid.toFileName(true,true,true,".json"))

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

async function getCreatorLinks(creatorId, index = 1){
    let videos = []
    let creatorData = await fetch('https://pmvhaven.com/api/videos?uploader=' + creatorId +'&limit=100&page=' + index)
    let jsonData = await creatorData.json()
    videos = jsonData.videos
    while(jsonData.pagination.hasNext){
        index = index + 1
        await new Promise(resolve => setTimeout(resolve, 3000));

        let newData = await getCreatorLinks(creatorId, index)
        videos.push(...newData)
    }

    return videos
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
    creator_id = window.location.pathname.split('/').pop()
    studio_name = document.querySelector("h1.text-2xl").textContent
    const alreadyDownloaded = getStoredDownloaded()
    let creatorData = await getCreatorLinks(creator_id)
    console.log(creatorData)

    for (const item of creatorData) {
        let video = new VideoData({source: "PMVH_AutoDLv1"})
        console.log(item)
        video.title = item.title
        video.dlKey = item.videoUrl
        video.id = item._id
        video.studio = studio_name
        video.date = new Date(item.uploadDate)
        video.downloaded = alreadyDownloaded.includes(item._id)
        video.url = generatePMVHavenUrl(item.title, item._id)

        allVideos.push(video)
     }
    // Order array oldest->newest (so we can resume later if we want)
    allVideos = allVideos.sort((a,b) => a.date > b.date ? 1 : -1)
    console.log(allVideos)
    // Initialise links to be all links (unfiltered)
    filterVideos(getStoredDate())
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
    let videoData = await getVideoData(videoID)
    studio_name = videoData.creator[0]

    let video = new VideoData({source: "PMVH_AutoDLv1"})
    video.title = videoData.title
    video.date = videoData.uploadDate
    video.studio = studio_name
    video.url = window.location.href
    video.id = videoID
    video.rawData = videoData

    let downloadedVideos = getStoredDownloaded()
    if (downloadedVideos && downloadedVideos.length > 0 && downloadedVideos.includes(videoID)){
        if (!confirm("This video has already been downloaded. Download Anyways ?")){
            return
        }
    }
    
    console.log("Downloading " + video.title)
    console.log(video)
    
    currentDLPromise = Download(video, videoData.videoUrl, {
        conflictAction : "prompt"
    })
    await currentDLPromise
    downloadText(video.toString(),"json",video.toFileName(true,true,true,".json"))
}

function createButton(){
    const b = document.createElement('input');
    b.setAttribute('style','position:fixed; top:80px; right:20px;z-index: 1000; display:block');
    b.setAttribute('class', "bg-[#2A2A2A] text-gray-300 hover:text-white p-2 rounded-lg hover:bg-[#3A3A3A] transition-colors inline-flex gap-1 text-sm")
    b.setAttribute('id','AutoDL');
    b.setAttribute('type','button');
    b.value = "AutoDL"
    document.body.append(b)
    b.addEventListener('click',() => {
        let MODE = patternVideo.test(window.location.href) ? "VIDEO" : patternProfile.test(window.location.href) ? "PROFILE" : patternCreator.test(window.location.href) ? "CREATOR" : "ERROR"
        if (MODE == "CREATOR"){
            // Creator mode is deprecated following the migration to new PMVH
            //buttonClickList()
        }
        else if (MODE == "PROFILE"){
            buttonClickList()
        }
        else if (MODE == "VIDEO"){
            console.log(b)
            buttonClickSingleDL()
        }
        else{
            console.error("Unknown Mode: " + MODE)
        }
    })
    return b
}


// Deprecated for now
function displayDownloaded(){
    const SELECTOR = ".v-card.v-card--link"
    allVideoLinks = document.querySelectorAll(SELECTOR)
    console.log(allVideoLinks)
    if(allVideoLinks == null){
        // Retry in 0.5s
        setTimeout(displayDownloaded, 500)
    }

    for(const videoLink of allVideoLinks){
        try {
            let link = videoLink.parentNode.href
            let id = link.split("_").at(-1)
            let studio = videoLink.querySelector(".fa-user").parentNode.querySelector("span").innerText
            let isDownloaded = getStoredDownloaded(studio).includes(id)
            if(isDownloaded){
                let overlay = document.createElement("div")
                overlay.innerText = "💾"
                overlay.style.fontSize = "xx-large"

                let parent = videoLink.querySelector(".v-card__overlay")
                parent.appendChild(overlay)
                parent.style.opacity = "0.5"
                console.log(parent)
            }
        }
        catch (error) {
        }
    }
}

var mainCalled = false
setInterval(() => {
    mainCalled = false
}, 2000)

function main(){
    if(mainCalled){
        // Only run if the function wasn't recently called
        return
    }
    mainCalled = true

    console.log("Run")
    let dialog = document.createElement('dialog')
    dialog.setAttribute('id','AutoDLDialog')
    dialog.innerHTML = MODAL_HTML
    document.body.appendChild(dialog)
    studio_name = window.location.pathname.split('/').pop()
    initModal(dialog)
    if(button == null){
        button = createButton(dialog)
    }

    if(patternVideo.test(window.location.href) || patternProfile.test(window.location.href)){
        button.style.display = "block"
    }
    else{
        button.style.display = "none"
    }
    //displayDownloaded()
}


// On page change, call main() again
var observer = new MutationObserver((mutationsList) => {
    main()
})
observer.observe(document.querySelector(".isolate"), { subtree: true, childList: true });



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
