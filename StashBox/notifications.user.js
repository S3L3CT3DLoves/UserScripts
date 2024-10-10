// ==UserScript==
// @name         StashBox Notifications
// @namespace    https://stashdb.org/
// @version      0.3
// @description  Notifications for StashBox !
// @author       You
// @match        https://stashdb.org/*
// @match        https://pmvstash.org/*
// @match        https://fansdb.cc/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=stashdb.org
// @grant        GM_addStyle
// ==/UserScript==

let notificationMenuItem = null
let notificationMenuContainer = null
let notificationCounter = 0
let notificationList = []
let readNotificationsList = {}

GET_OPEN_USER_EDITS =`
query QueryEdits($input: EditQueryInput!) {
  queryEdits(input: $input) {
    edits {
      details {
        ... on PerformerEdit {
          name
        }
        ... on SceneEdit {
          title
          studio {
            name
          }
        }
        ... on StudioEdit {
          name
        }
        ... on TagEdit {
          name
        }
      }
      id
      status
      target {
        ... on Performer {
          name
        }
        ... on Scene {
          title
          studio {
            name
          }
        }
        ... on Studio {
          name
        }
        ... on Tag {
          name
        }
      }
      target_type
      comments {
        date
        id
        user {
          id
        }
      }
      expires
    }
    count
  }
}
`

NOTIFICATION_UI_HTML = `<div id="notificationContainer" method="dialog">
    <section>
      <div class="list-group">
      </div>
    </section>
    <button class="btn btn-secondary-outline" id="notifMarkAllRead" type="button">Mark all as read</button>
</div>`

function toggleNotificationList(){
    if(notificationMenuContainer.style.display == 'block'){
        notificationMenuContainer.style.display = 'none'
    }
    else{
        notificationMenuContainer.style.display = 'block'
    }
}

function forceCloseNotificationList(event){
    if (!notificationMenuContainer.contains(event.target) && !notificationMenuItem.contains(event.target)) {
        notificationMenuContainer.style.display = 'none'
    }
}

async function getOtherUsersOpenEdits(){
  let gqlInput = {
      "page" : 1,
      "per_page" : 200,
      "include_user_submitted" : false,
      "status" : "PENDING"
  }

  let result = await fetch('https://pmvstash.org/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: GET_OPEN_USER_EDITS,
        variables: {
          input: gqlInput,
        },
      }),
    })
  
  let resultJson = await result.json()
  return resultJson["data"]["queryEdits"]
}

async function getUserOpenEdits(userId){
    let gqlInput = {
        "page" : 1,
        "per_page" : 100,
        "include_user_submitted" : true,
        "user_id" : userId,
        "status" : "PENDING"
    }

    let result = await fetch('https://pmvstash.org/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: GET_OPEN_USER_EDITS,
          variables: {
            input: gqlInput,
          },
        }),
      })
    
    let resultJson = await result.json()
    return resultJson["data"]["queryEdits"]
}

async function getCurrentUserId(){
    let gqlInput = {}
    let gqlQuery = `
    query Me {
        me {
            id
        }
    }
    `

    let result = await fetch('https://pmvstash.org/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: gqlQuery,
          variables: {
            input: gqlInput,
          },
        }),
      })
    
    let resultJson = await result.json()
    return resultJson["data"]["me"]["id"]
}

function markNotificationAsRead(notification){
    readNotificationsList[notification.id] = notification
    localStorage.setItem("notifications", JSON.stringify(readNotificationsList))
}

function getReadNotifications(){
    readNotificationsList = JSON.parse(localStorage.getItem("notifications")) ?? {}
    // Cleanup old data
    let newList = {}
    for(const notificationId in readNotificationsList){
        let expDate = new Date(readNotificationsList[notificationId]["exp"])
        if(expDate > Date.now()){
          newList[notificationId] = readNotificationsList[notificationId]
        }
    }
    readNotificationsList = newList
}

function setupUI(){
    notificationMenuItem = document.createElement('a')
    notificationMenuItem.classList.add("nav-link","ms-auto","me-4")
    notificationMenuItem.onclick = toggleNotificationList

    let menuBarContainer = document.getElementsByClassName("align-items-center navbar-nav")[0]
    menuBarContainer.insertBefore(notificationMenuItem, menuBarContainer.firstChild)

    const tempMenuItem = document.createElement('template')
    tempMenuItem.innerHTML = NOTIFICATION_UI_HTML
    notificationMenuContainer = tempMenuItem.content.firstChild
    document.querySelector('main').append(notificationMenuContainer)
    document.body.addEventListener('click', forceCloseNotificationList)

    const markAllReadButton = document.getElementById("notifMarkAllRead")
    markAllReadButton.addEventListener('click', markAllAsRead)
    refreshUI()
}

function refreshUI(){
    const menuTitle = "Notifications"
    const notificationDisplayList = notificationMenuContainer.childNodes[1].childNodes[1]
    notificationDisplayList.innerHTML = ""

    if(notificationCounter > 0){
        notificationMenuItem.innerHTML = menuTitle + " <span class='badge text-bg-warning'>" + notificationCounter + "</span>"
        notificationList.forEach(notification => {
            let notificationDisplay = document.createElement("div")
            notificationDisplay.classList.add("list-group-item")
            notificationDisplay.textContent = "[" + notification.type + "] " + notification.name
            notificationDisplay.onclick = (event) => {
                markNotificationAsRead(notification)
                window.location.pathname = "/edits/" + notification.id
            }
            notificationDisplayList.append(notificationDisplay)
        })
    }
    else{
        notificationMenuItem.innerHTML = menuTitle
        let notificationDisplay = document.createElement("span")
        notificationDisplay.textContent = "No notifications left to read"
        notificationDisplayList.append(notificationDisplay)
    }
}

function addNotification(edit, notificationType){
    let editName = ""
    switch(edit["target_type"]){
        case "SCENE":
            editName = edit["details"]["title"] ?? edit["target"]["title"]
            break
        case "STUDIO":
        case "TAG":
        case "PERFORMER":
            editName = edit["details"]["name"] ?? edit["target"]["name"]
    }
    // Check that this comment hasn't already been read
    if(readNotificationsList[edit["id"]] == undefined || edit["comments"].length > readNotificationsList[edit["id"]]["comments"]){
        notificationList.push({
            id: edit["id"],
            name : editName,
            comments : edit["comments"].length,
            exp: edit["expires"],
            type: notificationType
        })
    
        notificationCounter += 1
    }
}

function markAllAsRead(event){
  notificationList.forEach(notification => {
    markNotificationAsRead(notification)
  })
  notificationList = []
  notificationCounter = 0
  refreshUI()
}

function hasNewComments(edit, currentUserId){
  let sortedComments = edit["comments"].sort((commentA, commentB) => new Date(commentB["date"]) - new Date(commentA["date"]))
  let newComments = 0
  for(let i in sortedComments){
    if(sortedComments[i]["user"]["id"] == currentUserId){
      break
    }
    newComments += 1
  }
  return newComments > 0
}

async function main(){
    // Delay a bit, too often the page is not fully loaded when this runs
    await new Promise((resolve, reject) => setTimeout(_ => resolve(), 500))

    setupUI()
    getReadNotifications()
    let currentUserId = await getCurrentUserId()

    let userEdits = await getUserOpenEdits(currentUserId)
    let filteredEdits = userEdits["edits"].filter((edit) => {
      if(edit["comments"] && edit["comments"].length > 1){
        let counter = edit["comments"].filter(comment => comment["user"]["id"] != currentUserId).length
        if(counter > 0){
          return hasNewComments(edit, currentUserId)
        }
      }
      return false
    })

    filteredEdits.forEach((edit) => addNotification(edit, "MYEDITS"))

    let otherUserEdits = await getOtherUsersOpenEdits()
    let filteredOtherUserEdits = otherUserEdits["edits"].filter((edit) => {
      if(edit["comments"] && edit["comments"].length > 1){
        let counter = edit["comments"].filter(comment => comment["user"]["id"] == currentUserId).length
        if(counter > 0){
          return hasNewComments(edit, currentUserId)
        }
      }
      return false
    })
    filteredOtherUserEdits.forEach(edit => addNotification(edit, "COM"))
    refreshUI()
}

//--- CSS for the modal
GM_addStyle ( `
    #notificationContainer {
        position:               absolute;
        top:                    60px;
        right:                  2em;
        max-width:              25%;
        max-height:             50%;
        padding:                2em;
        background-color:       rgba(255,255,255,0.3);
        box-shadow:             0 4px 8px rgba(0, 0, 0, 0.1);
        border-radius:          5ex;
        z-index:                777;
        display:                none;
    }
`);

main()
