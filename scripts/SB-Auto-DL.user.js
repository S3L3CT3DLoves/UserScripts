// ==UserScript==
// @name         SpankBang AutoDL
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Dashboard to download all a user's videos on SpankBang
// @author       S3L3CT3D
// @match        https://spankbang.com/profile/*/videos
// @icon         https://www.google.com/s2/favicons?sz=64&domain=spankbang.com
// @grant        GM_download
// @grant        GM_addStyle
// @require http://code.jquery.com/jquery-latest.js
// ==/UserScript==

const TAGS_SELECTOR = "#video > div.left > div.searches > a"
const JSON_SELECTOR = "#container > script[type='application/ld+json']"
const STUDIO_SELECTOR = ""
const DETAILS_SELECTOR = "#video > div.left > div.info > section.details > div > p:nth-child(2)"

const MODAL_HTML = `
<div id="gmPopupContainer" class="modal">
  <div class="modal-content">
    <h2>Auto Downloader for SpankBang</h2>
    <div>
        <span id="gmStatus">There are no videos to download</span>
        <button id="gmStartDL" type="button" disabled>Start Download</button>
        <button id="gmStopDL" type="button" disabled>Stop Downloads</button>
    </div>
    <div>
        <label for="startDate">To limit the download to latest videos, select a date:</label>
        <input type="date" id="startDate" />
    </div>
    <div id="progressBarContainer">
        <div id="underneathBar">
            <div id="progressBar"></div>
        </div>
    </div>
    <div>
        <textarea id="gmLogConsole" rows="10" cols="100"></textarea>
    </div>
    <button id="gmCloseDlgBtn" type="button">Close popup</button> (Closing the popup does not stop the downloads)
  </div>

</div>`

var parser = new DOMParser ();
var links = [];
var allLinks = [];
var prevConsole = "";
var currentDL;
const studio_name = window.location.pathname.split('/')[2]


// Helper Functions

function delay(milliseconds){
    return new Promise(resolve => {
        setTimeout(resolve, milliseconds);
    });
}

function downloadText(text, fileType, fileName) {
  var blob = new Blob([text], { type: fileType });

  var a = document.createElement('a');
  a.download = fileName;
  a.href = URL.createObjectURL(blob);
  a.dataset.downloadurl = [fileType, a.download, a.href].join(':');
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 1500);
}

function Download(url, name, opt={}) {
	Object.assign(opt, { url, name })

	return new Promise((resolve, reject) => {
		opt.onerror = reject
		opt.onload = resolve

		GM_download(opt)
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


// Start of code

async function getVideoData(url){
    return await fetch(url)
        .then((response) => response.text())
        .then((response) => {
        const vid_page = parser.parseFromString (response, "text/html");
        const vid_elm = vid_page.querySelector('#video')
        const json_data = JSON.parse(vid_page.querySelector(JSON_SELECTOR).textContent)
        const tags = Array.from(vid_page.querySelectorAll(TAGS_SELECTOR)).map((tag) => tag.textContent)
        const details = vid_page.querySelector(DETAILS_SELECTOR).textContent
        return [vid_elm.getAttribute('data-streamkey'),json_data, tags, details]
    })
}

async function getDownloadURL(streamkey){
    const formData = new FormData();
    formData.append("id", streamkey);
    return await fetch('https://spankbang.com/api/download',{
        method: 'POST',
        body: formData
    })
    .then((response) => response.json())
    .then((data) => {
        // list is always ordered from worst to best, grab the best
        return data.results.pop().url
    })
}

async function autoDL(){
    document.querySelector("#gmStartDL").disabled = true
    document.querySelector("#gmStopDL").disabled = false
    for (const link of links) {
        if (link.downloaded){
            continue
        }
        modalConsoleLog("=== Starting Download : " + link.title + " ===")
        downloadText(JSON.stringify(link),'json',link.id + " - " + link.title + ".json")

        // Now download the video
        const dl_link = await getDownloadURL(link.dlKey)
        updateProgressBar(true,0)
        currentDL = GM_download({
            url : dl_link,
            name: link.id + " - " + link.title + ".mp4",
            conflictAction : "prompt",
            onprogress : function (p) {
                let percent = Math.round((p.loaded/p.total)*100)
                updateProgressBar(true, percent)
                if( percent %10 == 0 ){
                    modalConsoleLog(link.title + " - Progress: " + percent + "%")
                }
            },
            onerror: function (e) { console.log(e) },
            onload: function () {
                link.downloaded = true
                updateProgressBar(false,0)
                modalConsoleLog("=== " + link.title + " Download Finished ===")
                updateStoredDate(link.date)
            }
        })
        await currentDL
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
            downloaded: false
        }
        allLinks.push(video_data)

        // Throttle parsing otherwise we get 429 errors
        delay(1000)
     }
    // Order array oldest->newest (so we can resume later if we want)
    allLinks = allLinks.sort((a,b) => new Date(a.date) > new Date(b.date) ? 1 : -1)
    // Initialise links to be all links (unfiltered)
    links = allLinks
}

async function filterLinks(selectedDate){
    links = []
    for (const link of allLinks) {
        if (new Date(link.date) < selectedDate) {
            continue
        }
        links.push(link)
    }
    updateStatus("There are " + links.length +" videos to download")
}

async function initModal(){
    document.querySelector("#startDate").addEventListener("blur", setSelectedDate)
    document.querySelector("#startDate").valueAsDate = getStoredDate()

    await parseLinks()
    updateStatus("There are " + links.length +" videos to download")

    document.querySelector("#gmStartDL").disabled = false
    document.querySelector("#gmStopDL").disabled = true
    modalConsoleLog("Welcome to AutoDL - Ready !")
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

$(document).ready(function() {
    $('body').append('<input type="button" value="AutoDL" id="AutoDL">');
    $("#AutoDL").css("position", "fixed").css("top", 60).css("right", 20).css("display","none");
    $("#AutoDL").css("display","block")
    $("body").append(MODAL_HTML)
    $("#gmCloseDlgBtn").click ( function () {
        $("#gmPopupContainer").hide();
    } );
    $("#AutoDL").click ( function () {
        $("#gmPopupContainer").show();
    } );
    $('#gmStartDL').click(autoDL);
    $('#gmStopDL').click(stopDownloads);
    initModal()
});


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
        display:                none;
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
