const persistence = require('./persistence.js');

async function setFlash(session,message){
    let sd = await persistence.getSessionData(session);
    if (!sd){
        return undefined;
    }
    sd.flash = message;
    await persistence.updateSession(session,sd)
}

async function getFlash(session){
    let sd = await persistence.getSessionData(session);
    
    if (!sd){
        return undefined
    }
    let result = sd.flash;
    delete sd.flash
    await persistence.updateSession(session,sd)
    return result
}

module.exports = {
    setFlash, getFlash
}