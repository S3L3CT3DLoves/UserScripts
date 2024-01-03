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
         return elements.join(' - ') + type
    }
}
