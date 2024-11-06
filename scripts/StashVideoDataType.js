/** Class representing the metadata of a Video, provides a standard type for scraping into Stash */
class VideoData{
    constructor({title = "", date = Date(0), tags = [], performers = [], url = "", studio = "", details = "", image = "",id = 0, dlKey = "", dlUrl = "", downloaded = false, source = "Def_AutoDLv1.1"}){
        this.title = title
        this.date = date
        this.tags = tags
        this.url = url
        this.studio = studio
        this.details = details
        this.image = image
        this.id = id
        this.dlKey = dlKey
        this.dlUrl = dlUrl
        this.downloaded = downloaded
        this.performers = performers
        this._source = source
    }

    toString(){
        return JSON.stringify(this)
    }

    /**
     * 
     * @param {boolean} studio - Includes studio in filename if true
     * @param {boolean} id - Includes id in filename if true
     * @param {boolean} title - Includes title in filename if true
     * @param {string} type - File extension
     * @returns {string} - Filename based on the video's data
     */
    toFileName(studio = true, id = true, title = true, type = ".mp4"){
         let elements = []
         if(studio){
            elements.push(this.studio)
         }
         if(id){
            elements.push(this.id)
         }
         if(title){
            elements.push(this.title)
         }
        let filename = elements.join(' - ') + type
        filename = filename.replace(/[/\\?%*:|"<>]/g, '-');
        return filename
    }
}
