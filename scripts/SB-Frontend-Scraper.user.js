// ==UserScript==
// @name         SpankBang Frontend Scraper
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Use in Stash to scrape Spankbang from the browser, bypassing cloudflare issues
// @author       S3LECT3D
// @match        http://localhost:9997/scenes/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=undefined.localhost
// @grant        GM_xmlhttpRequest
// ==/UserScript==

const JSON_SELECTOR = "main > script[type='application/ld+json']"
const STUDIO_SELECTOR = "#video > div.left.space-y-0\\.5 > ul > li.primary_actions_container > a > span"
const DETAILS_SELECTOR = "#video > div.left.space-y-0\\.5 > div.info > section.details > div > div"

var parser = new DOMParser ();

function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    throw new Error('The given element does not have a value setter');
  };

  const eventName = element instanceof HTMLSelectElement ? 'change' : 'input';
  element.dispatchEvent(new Event(eventName, { bubbles: true }));
};

function setImage(url){
    const imageSelectButton = document.querySelector("label[for='cover_image'] ~ button")
    imageSelectButton.click()
    const imageSelectURL = document.querySelector("#set-image-popover > div.popover-body > div > button")
    imageSelectURL.click()
    const urlInput = document.querySelector("label[for='url'] + div input")
    const submitButton = document.querySelector(".ModalFooter.modal-footer button")
    setNativeValue(urlInput, url)
    submitButton.click()
}


async function parseLink(){
    focusEditTab()
    const link = document.querySelector("div.string-list-input > div input").value
    if(!link.startsWith("https://spankbang.com/")){
        return
    }
    const titleInput = document.querySelector("#title")
    const dateInput = document.querySelector("#date")
    const studioInput = document.querySelector("label[for='studio'] + div input")

    GM_xmlhttpRequest({
        method: 'GET',
        url: link,
        onload: function(response){
            const vid_page = parser.parseFromString (response.responseText, "text/html")
            console.log(vid_page)
            const json_data = JSON.parse(vid_page.querySelector(JSON_SELECTOR).textContent)
            const studio = vid_page.querySelector(STUDIO_SELECTOR).textContent
            setNativeValue(titleInput, json_data.name)
            setNativeValue(dateInput, json_data.uploadDate.split('T')[0])
            //setNativeValue(studioInput, studio.trim())
            setImage(json_data.thumbnailUrl)
        },
        onerror: function(e) { console.log(e) },

    })
}

function createButton(){
    const b = document.createElement('input');
    b.setAttribute('style','position:fixed; top:60px; right:20px; display:block');
    b.setAttribute('id','AutoDL');
    b.setAttribute('type','button');
    b.value = "AutoScrape"
    b.addEventListener('click',parseLink)
    document.body.append(b)
}

function focusEditTab(){
    const editTab = document.querySelector("div[role='tablist'] > div:nth-child(8) > a")
    editTab.click()
}

function main(){
    createButton()
}

main();
