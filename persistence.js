const mongodb = require('mongodb')

let client = undefined
let db = undefined
let users = undefined
let session = undefined
let stations = undefined
let dailyRecords = undefined

// Connect to the MongoDB database and initialize collections
async function connectDatabase() {
    if (!client) {
        client = new mongodb.MongoClient('INSERT YOUR MONGODB LINK HERE')
        db = client.db('project')
        users = db.collection('userAccounts')
        session = db.collection('SessionData')
        stations = db.collection('stations')
        dailyRecords = db.collection('dailyRecords')
        await client.connect()
    }
}

// Fetch a specific daily record by date
async function findDailyRecord(date){
    if(typeof date === 'object' && date instanceof Date){
        date = date
    }else{
        date = new Date(date)
    }
    await connectDatabase();
    let result = await dailyRecords.find({date:date}).toArray();
    return result[0];
}

// Check if a station exists in a record for a specific date
async function checkStationInRecord(date, id){
    await connectDatabase();
    let records = await findDailyRecord(date);
    if(!records){
        return undefined
    }
    for (let c of records.stationRecord){
        if (c.stationId==id){
            return true
        }
    }
    return false;
}

// Insert a new record into the dailyRecords collection
async function insertRecord(data){
    await connectDatabase();
    await dailyRecords.insertOne(data);
}

// Update the received fuel details for a specific station on a given date
async function updateRecievedFuel(date, id,  fuelReceivedPremium, fuelReceivedSuper){
    await connectDatabase();
    if(!await checkStationInRecord(date, id)){
        return undefined
    }
    let result = await dailyRecords.updateOne({date:date,'stationRecord.stationId': id }, {$set:{
        'stationRecord.$.fuelReceivedPremium': fuelReceivedPremium,
        'stationRecord.$.fuelReceivedSuper': fuelReceivedSuper
        }})
    return result.modifiedCount
}

// Update total sales for a specific station on a given date
async function updateSales(date, id, totalSales){
    let records = await findDailyRecord(date)
    let stationDayRecord;
    for (let c of records.stationRecord){
        if (c.stationId==id){
            stationDayRecord = c
            break
        }
    }
    let stationRecord = await stations.find({stationID: id}).toArray()
    let old_premiumSale = stationDayRecord.sales_premium
    let old_superSale = stationDayRecord.sales_super
    let newAddedSale = stationRecord[0].sales + totalSales - old_premiumSale - old_superSale
    await stations.updateOne({stationID: id}, {$set: {sales: newAddedSale}})
}

// Update a specific record with sales and fuel level details
async function updateOneRecordSales(date,id,fuelLevelPremium,fuelLevelSuper,sales_premium,sales_super){
    await connectDatabase();
    let records = await findDailyRecord(date);
    let totalSales = sales_premium+sales_super
    if(records){

        if(!await checkStationInRecord(date, id)){
            records.stationRecord.push({
                stationId:id,
                sales_premium:sales_premium,
                sales_super:sales_super,
                fuelLevelPremium:fuelLevelPremium,
                fuelLevelSuper:fuelLevelSuper,
                fuelReceivedPremium:0,
                fuelReceivedSuper:0
            })
            await dailyRecords.updateOne({date:date}, {$set: {stationRecord: records.stationRecord}})
            await stations.updateOne({stationID: id}, {$inc: {sales: totalSales}})
            return            
        }
        await updateSales(date, id, totalSales)
        await dailyRecords.updateOne({date:date,'stationRecord.stationId': id }, {$set:{
            'stationRecord.$.sales_premium':sales_premium,
            'stationRecord.$.sales_super':sales_super,
            'stationRecord.$.fuelLevelPremium':fuelLevelPremium,
            'stationRecord.$.fuelLevelSuper':fuelLevelSuper,            
            }})
        let message = "Warning!! You updated an existing data record for this date"
        return message
    }
    let data = {
        date:date,
        stationRecord:[{
            stationId:id,
            sales_premium:sales_premium,
            sales_super:sales_super,
            fuelLevelPremium:fuelLevelPremium,
            fuelLevelSuper:fuelLevelSuper,
            fuelReceivedPremium:0,
            fuelReceivedSuper:0
            }]
        }
    await stations.updateOne({stationID: id}, {$inc: {sales: totalSales}})
    await insertRecord(data)
    return
}
// Update the fuel level for a station based on the latest daily record
async function updateStationFuelLevel(id){
    let lastDateRecord = await getRecordsByDate(id)
    let stationDayRecord
    for(let c of lastDateRecord[0].stationRecord){
        if (c.stationId==id){
            stationDayRecord = c
            break
        }
    }
    result = await stations.updateOne({stationID: id}, {$set: {fuelLevelPremium: stationDayRecord.fuelLevelPremium, fuelLevelSuper: stationDayRecord.fuelLevelSuper}})
}

// Functionality for updating user information
async function updateUsername(oldUsername, newUsername){
    await connectDatabase();
    await users.updateOne({ username: oldUsername },{ $set: { username: newUsername } })
    await stations.updateOne({ managers: oldUsername },{ $set: { 'managers.$': newUsername } })
}

async function updatePhone(newPhone, username){
    await connectDatabase();
    await users.updateOne({ username: username },{ $set: { phone: newPhone } })
}

async function updateEmail(newEmail, username){
    await connectDatabase();
    await users.updateOne({ username: username },{ $set: { email: newEmail } })
}
//


//This function finds the record in dailyRecords that has the passed station id and then sorts the documents by decreasing order and returns the latest 2.
async function getRecordsByDate(id){
    await connectDatabase();      
    let record = await dailyRecords.find({
        "stationRecord.stationId":id
      }).sort({
        "date": -1
      }).limit(2);
    let records = record.toArray()
    return records
}

async function getDailyRecords(id){
    await connectDatabase();      
    let record = await dailyRecords.find({
        "stationRecord.stationId":id
      }).sort({
        "date": -1
      });
    let records = record.toArray()
    return records
}

async function getStationName(id){
    let stationName = stations.findOne(
        { "stationID": id },
        { "_id": 0, "name": 1 }
    )
    return stationName
}

async function getAllRecords(){
    await connectDatabase();
    let record = await stations.find().sort({"stationID":1})
    let records = record.toArray()
    return records
}

async function getTotalSales(){
    await connectDatabase();
    let totalSales = await stations.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: "$sales" }
          }
        }
      ]).toArray()
    return totalSales[0].total
}

async function getUserDetails(userName) {
    await connectDatabase();
    let user=await users.find({username:userName});
    let userDetails = await user.toArray();
    return userDetails[0];
}

async function getEmailDetails(email){
    await connectDatabase();
    let result = await users.findOne({email: email});
    return result;    
}

async function getToken(token){
    await connectDatabase();
    if(!token){
        return undefined;
    }
    let result = await users.findOne({token: token});
    return result;
}

async function updateUser(data){
    await connectDatabase();
    await users.replaceOne({username: data.username}, data);    
}

async function countUsers(){
    await connectDatabase();
    let totalUsers = await users.countDocuments()
    return totalUsers
}

async function countManagers(){
    await connectDatabase();
    let totalUsers = await users.countDocuments({ stationID: { $exists: true } })

    return totalUsers
}

async function updatePasswordByUsername(username, newPassword){
    await connectDatabase();
    await users.updateOne({ username: username },{ $set: { password: newPassword } })
  }

async function editManager(username,data){
    await connectDatabase();
    await users.replaceOne({username:username},data)
}

async function saveSession(uuid, expiry, data) {
    await connectDatabase();
    let sessionData = {
        sessionKey:uuid,
        expiry: expiry,
        data:data
    }
    await session.insertOne(sessionData)
}

async function getSessionData(key) {
    await connectDatabase();
    let sessiond= await session.find({sessionKey:key}) 
    let sessionData = await sessiond.toArray();

    return sessionData[0];
}

async function updateSession(ssid,sd){
    await connectDatabase();
    await session.replaceOne({sessionKey:ssid},sd)
}

async function updateSessionUsername(username,newU){
    await connectDatabase();
    await session.updateMany(
        { "data.username": username },
        { $set: { "data.username": newU } }
      );

}

async function deleteSession(key){
    await connectDatabase();
    await session.deleteOne({sessionKey:key});
}

async function getStationRecord(id){
    await connectDatabase();
    let stationRec = await stations.find({stationID:id})
    let stationRecord =await stationRec.toArray();
    return stationRecord[0]
}

async function getAllStandardUsers(){
    await connectDatabase();
    let standardUsers = await users.find({userType:"standard"});
    standardUsers = await standardUsers.toArray()
    return standardUsers
}

async function getAllManagerUsers(){
    await connectDatabase();
    let ManagerUsers = await users.find({userType:"manager"}).toArray();
    return ManagerUsers
}

async function countStations(){
    await connectDatabase();
    let totalStations = await stations.countDocuments()
    return totalStations
}

async function insertStation(data){
    await connectDatabase();
    await stations.insertOne(data);
}

async function editStation(ID,data){
    await connectDatabase();
    await stations.replaceOne({stationID:ID},data)
}

async function addUser(data){
    await connectDatabase();
    await users.insertOne(data)
}

async function getAllUsers(){
    await connectDatabase();
    let record = await users.find()
    let records = record.toArray()
    return records
}

module.exports = {
    getUserDetails,
     saveSession, getSessionData, updateSession, getDailyRecords,
    getStationRecord, getRecordsByDate, getAllRecords, deleteSession,
    updateRecievedFuel, updateOneRecordSales, findDailyRecord, updateStationFuelLevel,
    getAllStandardUsers, getAllManagerUsers,insertStation,editStation,
    getStationName, countStations, editManager,addUser,getAllUsers, updateUsername,
    updatePhone, updateEmail, countUsers, countManagers, getTotalSales,
    updateSessionUsername, updatePasswordByUsername,
    getEmailDetails,
    updateUser,
    getToken
}