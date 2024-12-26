const persistence = require("./persistence.js")
const crypto = require("crypto")

const nodemailer = require('nodemailer')
let transporter = nodemailer.createTransport({
    host:"127.0.0.1",
    port: 25
})

//Retrives station ID from userAccount collection
async function getStationId(username){
  let userDetails =await persistence.getUserDetails(username);
  return userDetails.stationID;
}

//function to calculate new user ID for new user
async function lastUserId(){
  let userCount = await countUsers()
  let lastUser = (userCount+1+60000).toString()
  return lastUser
}

//retrieves user ID from useraccount using username as key
async function findUserId(username){
  let user = await persistence.getUserDetails(username)
  return user.userId
}


//update Password function for reset password page to update the new password with hashing
async function updatePassword(email, password){
  let p = password
  let hash = crypto.createHash('sha256')
  hash.update(p)
  let result = hash.digest('hex')    
  let userDetails = await persistence.getEmailDetails(email)
  userDetails.password = result
  await persistence.updateUser(userDetails)
}

//function for reset password in profile page to check the current password
async function checkPassword(username, password){
  let p = password
  let hash = crypto.createHash('sha256')
  hash.update(p)
  let result = hash.digest('hex') 
  let userDetails = await persistence.getUserDetails(username);
  if(userDetails.password == result){
    return true
  }
  return false
}

//function to update password with hash for reset password in profile page
async function updatePasswordByUsername(username, newPassword){
  let p = newPassword
  let hash = crypto.createHash('sha256')
  hash.update(p)
  let result = hash.digest('hex') 
  await persistence.updatePasswordByUsername(username, result)
}

//function to delete token after resetting password
async function deleteToken(token){
  let result = await persistence.getToken(token)
  delete result.token;
  await persistence.updateUser(result);
}

//function to pass the sales of fuel type premium for the graph
async function getDailySalesPrem(id){
  let recentActivity = await persistence.getDailyRecords(id);
  for (let record of recentActivity) {
      delete record._id
      let filteredStationRecord = [];
      let formattedDate = record.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      });
      record.date = formattedDate;
      for (let stationRecord of record.stationRecord) {
        if (stationRecord.stationId === id) {
          filteredStationRecord.push(stationRecord);

        }
      }
      delete filteredStationRecord[0].sales_super
      delete filteredStationRecord[0].stationId
      delete filteredStationRecord[0].fuelLevelPremium
      delete filteredStationRecord[0].fuelLevelSuper
      delete filteredStationRecord[0].fuelReceivedPremium
      delete filteredStationRecord[0].fuelReceivedSuper
      record.sales_premium = filteredStationRecord[0].sales_premium;
      delete record.stationRecord
  }
  return recentActivity
}

//function to pass the sales of fuel type super for the graph
async function getDailySalesSup(id){
  let recentActivity = await persistence.getDailyRecords(id);
  for (let record of recentActivity) {
      delete record._id
      let filteredStationRecord = [];
      let formattedDate = record.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      });
      record.date = formattedDate;
      for (let stationRecord of record.stationRecord) {
        if (stationRecord.stationId === id) {
          filteredStationRecord.push(stationRecord);

        }
      }
      delete filteredStationRecord[0].sales_premium
      delete filteredStationRecord[0].stationId
      delete filteredStationRecord[0].fuelLevelPremium
      delete filteredStationRecord[0].fuelLevelSuper
      delete filteredStationRecord[0].fuelReceivedPremium
      delete filteredStationRecord[0].fuelReceivedSuper
      record.sales_super = filteredStationRecord[0].sales_super;
      delete record.stationRecord
  }
  return recentActivity
}

// function to pass the total sales for the graph
async function getDailyRecords(id){
    let recentActivity = await persistence.getDailyRecords(id)
    for (let record of recentActivity) {
        let filteredStationRecord = [];
        let formattedDate = record.date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric'
        });
        record.date = formattedDate;
        for (let stationRecord of record.stationRecord) {
          if (stationRecord.stationId === id) {
            stationRecord.totalSales = stationRecord.sales_premium + stationRecord.sales_super;
            stationRecord.totalReceived = stationRecord.fuelReceivedPremium + stationRecord.fuelReceivedSuper;  
            filteredStationRecord.push(stationRecord);
          }
        }
    
        record.stationRecord = filteredStationRecord;
    }
    
    let salesData = []
    for (let activity of recentActivity) {
      let totalSales = 0;
      for (let stationRecord of activity.stationRecord) {
        totalSales += stationRecord.sales_premium + stationRecord.sales_super;
      }
      salesData.push({ date: activity.date, totalSales });
    }    

    salesData.forEach(data => {
      const [month, day, year] = data.date.split('/');
      data.date = `${year}-${month}-${day}`;
    });
    return salesData
}

//Function to get daily records of a specific station sorted by date.
async function getRecordsByDate(id) {
    let records = await persistence.getRecordsByDate(id);
    let stationNames = await getStationNames()
    let name = stationNames[parseInt(id)-1]
    
    for (let record of records) {
      let filteredStationRecord = [];
      let formattedDate = record.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      });
      record.date = formattedDate;
      for (let stationRecord of record.stationRecord) {
        if (stationRecord.stationId === id) {
          stationRecord.totalSales = stationRecord.sales_premium + stationRecord.sales_super;
          stationRecord.totalReceived = stationRecord.fuelReceivedPremium + stationRecord.fuelReceivedSuper;  
          stationRecord.name = name.stationName
          filteredStationRecord.push(stationRecord);
        }
      }
  
      record.stationRecord = filteredStationRecord;
    }
  
    return records;
  }
  


//If the fuel level is less than 40% this function will return "yes" indicating alert. Max fuel level is 5000.

async function getLowFuelStations(){
  let totalStations = await persistence.countStations()
  let stationNames = await getStationNames()
  let stationList = []
  for(i=1;i<=totalStations;i++){
    let fuelLevel = await checkFuelLevel(i.toString())
    if (fuelLevel.includes(true)){
      let stations = stationNames[i-1].stationName
      stations = stations.split(' ')
      let petrolIndex = stations.indexOf("Petrol")
      if(petrolIndex!=-1){
        stations.splice(petrolIndex,1)
      }
      let stationIndex = petrolIndex
      if(stationIndex!=-1){
        stations.splice(stationIndex,1)
      }
      let name =""
      for (let c of stations){
        name+=c + ", "
      }
      stationList.push(name.trim()+" ")
    }
  }
  if (!stationList.length){
    return false
  }
  stationList[stationList.length - 1] = stationList[stationList.length - 1].slice(0, -1)
  if(stationList.length==1){
    stationList[stationList.length - 1] = "and "+  stationList[stationList.length - 1].slice(0, -1)+" branch"  
  }else{
    stationList[stationList.length - 1] = "and "+  stationList[stationList.length - 1].slice(0, -1)+" branches" 
  }
  return stationList
}

async function checkFuelLevel(stationID){
    let stationDetails = await persistence.getStationRecord(stationID);
    if(!stationDetails){
        return undefined
    }
    let superLevel = stationDetails.fuelLevelSuper
    let premiumLevel = stationDetails.fuelLevelPremium
    let levels = []
    let maxFuelLevel = 2500;
    if(superLevel<= 0.4*maxFuelLevel){
        levels[0]=true
    }else{
        levels[0]=false
    }

    if(premiumLevel<=0.4*maxFuelLevel){
        levels[1]=true
    }else{
        levels[1]=false
    }
    return levels
}


//gets station record from stations collection based on station id
async function getStationRecord(ID){
  let stationDetails = await persistence.getStationRecord(ID);
  return stationDetails
}

//gets all station records from stations collection
async function getAllRecords(){
  let records = await persistence.getAllRecords()
  for (c of records){
    let fuelLevel = await checkFuelLevel(c.stationID)
    c.fuelLevelS = fuelLevel[0]
    c.fuelLevelP = fuelLevel[1]
  }
  records.sort();
  return records;
}

//gets the total sales of all stations 
async function getTotalSales(){
  return await persistence.getTotalSales();
}

//calculates the average sales per station
async function getAverageSales(){
  let totalSales = await getTotalSales();
  let totalStations  = await persistence.countStations();
  let average = totalSales/totalStations;
  return average;
}

//function to add a station
async function addStation(name,ID,flp,fls,fps,fpp,sale,loc,managers,locLink){
  let data = {
    stationID:ID,
    fuelLevelPremium:flp,
    fuelLevelSuper:fls,
    fuelPriceSuper:fps,
    fuelPricePremium:fpp,
    sales:sale,
    location:loc,
    managers:managers,
    locatiionLink:locLink,
    name:name
}     
await persistence.insertStation(data)
}

//function to edit fields and update in station record
async function editStation(id,details){
  await persistence.editStation(id,details)
}

//function to add a new user  
async function addUser(data){
  let password = data.password
  let hash = crypto.createHash('sha256')
  hash.update(password)
  let hashedPassword = hash.digest('hex')
  data.password = hashedPassword
  await persistence.addUser(data)
}

//function to get all the details of all users in userAccounts
async function getAllUsers(){
  let rec = await persistence.getAllUsers()
  return rec
}



//fn to verify credentials in login page
async function checkLogin(username, password) {
    let userDetails = await persistence.getUserDetails(username);
    if(!userDetails){
      return undefined
    }
    let storedPassword = userDetails.password
    let hash = crypto.createHash('sha256')
    hash.update(password)
    let hashedPassword = hash.digest('hex')    
    if (userDetails == undefined || storedPassword != hashedPassword) {
      return undefined
    }
    return userDetails.userType;
}

//fn to check if the user has a station id or not(for manager)
async function checkUser(username,id){
  let userDetails = await persistence.getUserDetails(username);
  if (userDetails.stationID==id){
    return true
  }
  return false
}

//fn to start session 
async function startSession(data) {
    let sessionId = crypto.randomUUID();
    let sessionData = {
        sessionKey:sessionId,
        expiry: new Date(Date.now() + 1000*60*20),//change this later
        data:data
    }
    await persistence.saveSession(sessionData.sessionKey,sessionData.expiry,sessionData.data)
    return sessionData;
}

//function to count the number of users
async function countUsers(){
  return await persistence.countUsers();
}

//function to count the number of managers
async function countManagers(){
  return await persistence.countManagers();
}

//function to get all the station names in an array
async function getStationNames(){
  let totalStations = await persistence.countStations()
  let stationID = []
  for(let i=1;i<=Number(totalStations);i++){
    stationID.push(i.toString())
  }
  let idNameList = []
  for(let c of stationID){
    let stationName = await persistence.getStationName(c)
    idNameList.push({stationName:stationName.name,stationID:c})
  }
  return idNameList
}

//function to assign a user as manager
async function assignManager(usernameLists){
  for (let c of usernameLists){
    let user = await persistence.getUserDetails(c.userName)
    let station = await persistence.getStationRecord(c.stationID)
    if(!user || !station){
      return undefined
    }
    station.managers.push(c.userName)
    user.userType = "manager"
    user.stationID = c.stationID

    await persistence.editStation(c.stationID,station)
    await persistence.editManager(user.username,user)
  }
  return true;
}

//function to get session data based on session id
async function getSessionData(key) {
    return await persistence.getSessionData(key);
}

//function to delete the session from the database
async function deleteSession(key){
  return await persistence.deleteSession(key);
}

//function to update received fuel on a specific date and station
async function updateRecievedFuel(date, id,  fuelReceivedPremium, fuelReceivedSuper){
  return await persistence.updateRecievedFuel(date, id,  fuelReceivedPremium, fuelReceivedSuper)
}

//function to insert daily records of a station
async function updateOneRecordSales(date,id,fuelLevelPremium,fuelLevelSuper,sales_premium,sales_super){
  let message = await persistence.updateOneRecordSales(date,id,fuelLevelPremium,fuelLevelSuper,sales_premium,sales_super)
  let latestDate = await persistence.getRecordsByDate(id)
  if(latestDate[0].date.toString() == date.toString()){
    await persistence.updateStationFuelLevel(id)
  }
  return message
}

//function to return a specific daily record of date "date" and of station id "id"
async function findDailyRecord(date, id){
  let result = await persistence.findDailyRecord(date)
  if(!result){
    return undefined
  }
  for (c of result.stationRecord){
    if(c.stationId == id){
      return c
    }
  }
  return undefined
}

//function to get email and phone of a user of username "username"
async function getUserContacts(username){
  let userData = await persistence.getUserDetails(username)
  return [userData.email, userData.phone]
}

//function to update the new username from the profile view
async function updateUsername(oldUsername, newUsername){
  await persistence.updateUsername(oldUsername, newUsername)
  await updateSessionUsername(oldUsername,newUsername)
}

//function to update the new phone from the profile view
async function updatePhone(newPhone, username){
  await persistence.updatePhone(newPhone, username)
}

//function to update the new email from the profile view
async function updateEmail(newEmail, username){
  await persistence.updateEmail(newEmail, username)
}

//function to get all standard users for the admin view
async function getAllStandardUsers(){
  let standardUsers =  await persistence.getAllStandardUsers()
  for (c of standardUsers){
    delete c.password
    c.registeredDate = c.registeredDate.toLocaleDateString()
    c.username = c.username.toUpperCase()
  }
  return standardUsers
}

//function to get all manager users for the admin view
async function getAllManagerUsers(){
  let managerUsers =  await persistence.getAllManagerUsers()
  for (c of managerUsers){
    delete c.password
    c.registeredDate = c.registeredDate.toLocaleDateString()
    c.username = c.username.toUpperCase()
  }
  return managerUsers
}

//function to update username in session data
async function updateSessionUsername(username,newU){
  return await persistence.updateSessionUsername(username,newU)
}

//function to insert token in user account data in user collection if the email exists
async function emailCheck(email){
  let emailDetails = await persistence.getEmailDetails(email)
  if(!emailDetails){
      return
  }
  let token = await generateToken(email);
  return token;
}

//function to generate token for the reset password
async function generateToken(email){
  let randomToken = Math.floor(Math.random()*1000000);
  let emailDetails = await persistence.getEmailDetails(email)
  emailDetails.token = randomToken
  await persistence.updateUser(emailDetails)
  return randomToken;
}

//function to retrieve the token from the user accounts collection
async function getToken(token){
  let result = await persistence.getToken(token)
  return result
}

//function for sending the reset link to the email
async function testmail(to,key){
  let body= `<a href="http:/127.0.0.1:8000/reset-password/?key=${key}">Reset Link</a>`
  try{
    await transporter.sendMail({
      from:"admin@mail.com",
      to:to,
      subject:"Reset Password Link",
      html:body
  })
  }catch{
    return 0
  }

}

module.exports={
    checkLogin, startSession, getSessionData, getStationId, getDailyRecords,
    getStationRecord, checkFuelLevel, getRecordsByDate, checkUser, getAllRecords,
    deleteSession, updateRecievedFuel, updateOneRecordSales, findDailyRecord,
    getAllStandardUsers, getAllManagerUsers,addStation,editStation,
    getStationNames, assignManager, addUser,getAllUsers, getUserContacts,
    updateUsername, updatePhone, updateEmail,countUsers,countManagers,
    getTotalSales, findUserId, updatePasswordByUsername,
    getAverageSales, checkPassword,
    getLowFuelStations,
    updateSessionUsername,
    lastUserId,
    emailCheck,
    testmail,
    getToken,
    getDailySalesPrem,getDailySalesSup,
    updatePassword,
    deleteToken
}