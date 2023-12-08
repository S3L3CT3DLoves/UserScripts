# UserScripts
Contains scripts to be used with Stash

# SB-Frontend-Scraper.user.js
Map to your local Stash url and it will show up as a button in Scene pages.
Add the Spankbang URL to your scene (in the URL field)
Click the button

Scraping features:
- Title
- Date
- Image

Might add Studio, but it's buggy, only works if the username on Spankbang is the Studio name (or an alias)

# SB-Auto-DL.user.js
Provides a button and interface to automatically download all the videos published by a user on SB.
Needs to be done page by page.

Features:
- UI to display download status & progress
- Filtering to only most recent videos
- Stop / Resume if downloading multiple videos
- Saving the Video's info to a JSON file next to the mp4

Meant to be used with a Stash scraper that parses the JSON file afterwards (WIP).
