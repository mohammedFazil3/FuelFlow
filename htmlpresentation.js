const express = require('express')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const business = require('./business.js')
const flash = require('./flash.js')
const fileupload = require('express-fileupload')
const Jimp = require('jimp')

// Initializing the Express app
let app = express()
app.use(fileupload())

// Setting up view engine with Handlebars
const handlebars = require('express-handlebars')
app.set('views', __dirname+"/templates")
app.set('view engine', 'handlebars')
app.engine('handlebars', handlebars.engine())

// Middleware for parsing request bodies and cookies
app.use(bodyParser.json())
app.use(bodyParser.urlencoded())
app.use(cookieParser())
app.use("/static",express.static(__dirname+"/static"));

// Custom 404 error handling
function function404(req, res) {
    res.status(404).render("error404", {layout:undefined})
}

// Routes for password reset functionality
app.get('/forgetPassword',async (req,res)=>{
    let resetMsg = req.query.resetMsg
    res.render('forgetPassword',{layout:undefined,msg:resetMsg})
})

app.post('/forgetPassword',async (req,res)=>{
    let resetEmail = req.body.resetEmail
    let resetToken = await business.emailCheck(resetEmail)
    if (resetToken) {
        console.log(`http:/127.0.0.1:8000/reset-password/?resetKey=${resetToken}`)
        let mailresult = await business.testmail(resetEmail, resetToken)
        if(mailresult == 0){
            console.log("Please start the email server")
        }
    }
    res.redirect("/forgetPassword?resetMsg=Check your email account for the reset link")
})

// Routes for resetting password
app.get('/reset-password',async(req,res)=>{
    let resetKey = Number(req.query.resetKey)
    let resetDetails = await business.getToken(resetKey)
    if (resetDetails) {
        let resetUser = resetDetails.email
        let resetMessage = undefined
        res.render("reset-password", { layout: undefined, user: resetUser, message: resetMessage, token: resetKey })
    } else {
        let resetMessage = true;
        res.render("reset-password", { layout: undefined, message: resetMessage })
    }

})

app.post('/reset-password', async (req, res) => {
    let resetUser = req.body.user
    let resetPassword = req.body.password
    await business.updatePassword(resetUser, resetPassword)
    await business.deleteToken(Number(req.body.token))
    res.redirect('/login?message=Your password has been reset successfully')
})

// API endpoint for handling file uploads
app.post('/api/file',async (req,res)=>{
    let file = req.files.submission
    let userId = req.body.userId
    const filePath = `${__dirname}/static/assets/img/avatars/${userId}.jpg`;

    await file.mv(filePath);

    const image = await Jimp.read(filePath);
    await image.resize(128,128);
    await image.writeAsync(filePath);    
    res.send('OK')
})


//API endpoint for registering users
app.put('/api/admin/station',async (req,res)=>{
    let id = req.body.stationID;
    let details = req.body;
    await business.editStation(id,details)
    res.send('OK')
})

app.get('/api/user', async(req,res)=>{
    let users = await business.getAllUsers()
    res.send(users)
})

app.post('/api/user', async (req, res) => {
    let data = req.body
    data.registeredDate=new Date(data.registeredDate)
    await business.addUser(data)
    res.redirect('/login')
});

app.get('/api/recentActivity/:id',async (req,res)=>{
    let id = req.params.id
    let recentActivity = await business.getRecordsByDate(id);
    res.send(recentActivity)
})

app.get('/api/admin/station', async (req, res) => {
    let stations = await business.getAllRecords()
    res.send(stations)
});

app.get('/api/admin/station/:ID',async (req,res)=>{
    let id = req.params.ID;
    res.send(await business.getStationRecord(id))
})

app.post('/api/user/:username/password-verify',async(req,res)=>{
    let username = req.params.username
    let password = req.body.oldPassword
    let result = await business.checkPassword(username, password)
    res.send({flag: result})
})

app.patch('/api/user/:username/password',async(req,res)=>{
    let username = req.params.username
    let password = req.body.newPassword
    await business.updatePasswordByUsername(username, password)
    res.send('ok')
})

//login page
app.get('/login',async(req,res)=>{
    let sessionId = req.cookies.projectkey;
    let fm = await flash.getFlash(sessionId);
    res.render('login2',{layout:undefined,message:fm})
})

app.post('/login-form',async(req,res)=>{
    let username = req.body.username;
    let password = req.body.password;

    let accountType = await business.checkLogin(username,password);

    if (!accountType){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Invalid Credentials")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);

        res.redirect("/login");
        return        
    }else{
        let sessionData = await business.startSession({
            userType:accountType,
            username:username
        })
        res.cookie('projectkey',sessionData.sessionKey,{expires:sessionData.expiry})
        if (sessionData.data.userType=="admin"){
            res.redirect("/admin")
        }else if (sessionData.data.userType=="manager"){
            let stationID = await business.getStationId(username);
            res.redirect(`/manager/${stationID}`)
        }else{
            res.redirect(`/standard`)
        }
    }
})

//registered-user view
app.get('/standard',async(req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);

    if(!sessionData || sessionData.data.userType!="standard"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }

    let username = sessionData.data.username
    let [email, phone] = await business.getUserContacts(username)
    let userId = await business.findUserId(username)
    res.render('profileView', {
        layout: 'profile',
        username: username,
        email: email,
        phone: phone,
        userId: userId
    })
})

//Pfp submission
app.post('/file-submission',async(req,res)=>{
    let file = req.files.submission
    const filePath = `${__dirname}/static/assets/img/avatars/${req.body.userId}.jpg`;

    await file.mv(filePath);

    const image = await Jimp.read(filePath);
    await image.resize(128,128);
    await image.writeAsync(filePath);   
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);
    
    if(sessionData.data.userType=="standard"){
        res.redirect(`/${sessionData.data.userType}`);
        return
    }

    res.redirect(`/${sessionData.data.userType}/profile`);
})

//Editing profile for registered users
app.patch('/api/user/:username/username',async(req,res)=>{
    let oldUsername = req.params.username
    let newUsername = req.body.newuser
    await business.updateUsername(oldUsername, newUsername)
    res.send('ok')
})

app.patch('/api/user/:username/phone',async(req,res)=>{
    let newPhone = req.body.newPhone
    let username = req.params.username
    await business.updatePhone(newPhone, username)
    res.send('ok')
})

app.patch('/api/user/:username/email',async(req,res)=>{
    let newEmail = req.body.newEmail
    let username = req.params.username
    await business.updateEmail(newEmail, username)
    res.send('ok')
})

//Public View
app.get('/',async(req,res)=>{
    let records = await business.getAllRecords();
    if(!records){
        return undefined
    }
    res.render('publicView',{
        layout:'home_layout',
        records:records
    })
})
app.get('/aboutUs',(req,res)=>{
    let Link = "About Us"
    res.render('aboutUs',{
        Link:Link,
        layout:'home_layout'
    })
})
app.get('/FAQS',(req,res)=>{
    let Link = "FAQS"
    res.render('FAQS',{
        Link:Link,
        layout:'home_layout'
    })
})
app.get('/privacyPolicy',(req,res)=>{
    let Link = "Privacy Policy"
    res.render('privacyPolicy',{
        Link:Link,
        layout:'home_layout'
    })
})
app.get('/safety',(req,res)=>{
    let Link = "Safety"
    res.render('safety',{
        Link:Link,
        layout:'home_layout'
    })
})
app.get('/contactUs',(req,res)=>{
    let Link ="Contact Us"
    res.render('contactUs',{
        Link:Link,
        layout:'home_layout'
    })
})

app.get("/logout",async(req,res)=>{
    let key = req.cookies.projectkey
    await business.deleteSession(key)
    res.cookie('projectkey','')
    res.redirect('/login')
})

app.get("/manager/profile",async (req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);


    if(!sessionData || sessionData.data.userType!="manager"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }
    
    let username = sessionData.data.username
    let stationID = await business.getStationId(username);
    let [email, phone] = await business.getUserContacts(username)
    let userId = await business.findUserId(username)
    res.render('profileView', {
        layout: 'manager_coureUI',
        username: username,
        email: email,
        phone: phone,
        userId: userId,
        link:"Profile",
        id:stationID
    })
})

//manager
app.get('/manager/:stationId',async (req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);

    if(!sessionData || sessionData.data.userType!="manager"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }

    let id = req.params.stationId
    if(sessionData.data.userType=="manager"){
        let username = sessionData.data.username;
        let check = await business.checkUser(username,id)
        if(!check){
            let sessionData =await business.startSession({
                userType:"",
                username:""
            });
            await flash.setFlash(sessionData.sessionKey,"Please Login")
            res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
            res.redirect("/login");
            return             
        }
    }
    let record = await business.getStationRecord(id)
    let levels = await business.checkFuelLevel(id)
    let recentActivity = await business.getRecordsByDate(id);
    let salesData = await business.getDailyRecords(id);
    if(!record || !levels){
        return 
    }
    let superLevel = levels[0]
    let premiumLevel = levels[1]
    let username = sessionData.data.username
    let userId = await business.findUserId(username)

    res.render("manager",{
        id:id,
        userId: userId,
        layout:'manager_coureUI',
        record:[record],
        superLevel:superLevel,
        premiumLevel:premiumLevel,
        recentActivity:recentActivity,
        salesData:JSON.stringify(salesData)
        })
    return
})

app.get("/api/:stationID",async (req,res)=>{
    let id = req.params.stationID
    let record = await business.getStationRecord(id)
    let levels = await business.checkFuelLevel(id)
    let recentActivity = await business.getRecordsByDate(id);
    let salesData = await business.getDailyRecords(id);
    let salesPrem = await business.getDailySalesPrem(id);
    let salesSup = await business.getDailySalesSup(id);
    if(!record || !levels){
        return
    }
    superLevel = levels[0]
    premiumLevel = levels[1]

    res.send({
        id:id,
        record:[record],
        superLevel:superLevel,
        premiumLevel:premiumLevel,
        recentActivity:recentActivity,
        salesData:salesData,
        salesPrem:salesPrem,
        salesSup:salesSup
    })
    return
})

app.get("/manager/:stationId/recordDelivery",async (req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);

    if(!sessionData || sessionData.data.userType!="manager"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }

    let id = req.params.stationId
    if(sessionData.data.userType=="manager"){
        let username = sessionData.data.username;
        let check = await business.checkUser(username,id)
        if(!check){
            let sessionData =await business.startSession({
                userType:"",
                username:""
            });
            await flash.setFlash(sessionData.sessionKey,"Please Login")
            res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
            res.redirect("/login");
            return             
        }
    }
    let message = req.query.message;
    let username = sessionData.data.username
    let userId = await business.findUserId(username)
    res.render("recordDelivery", {
        layout: 'manager_coureUI',
        id: req.params.stationId,
        message:message,
        userId:userId
    })
})

app.post("/record-delivery/:stationId", async (req,res)=>{
    let id = req.params.stationId
    let deliveryDate = new Date(req.body.deliveryDate)
    let receivedPremium = Number(req.body.fuelReceivedPremium)
    let receivedSuper = Number(req.body.fuelReceivedSuper)
    let currentDate = new Date();
    if(deliveryDate <= currentDate){
        let modified = await business.updateRecievedFuel(deliveryDate, id,  receivedPremium, receivedSuper)    
        if(!modified){
            res.redirect(`/manager/${id}/recordDelivery?message="The daily sales record for this date is not updated yet!!"`)
            return
        }
    }else{
        res.redirect(`/manager/${id}/recordDelivery?message=You cannot enter data for a future date.`)
        return
    }
    res.redirect(`/manager/${id}/recordDelivery`)
    return
})

app.post("/record-sales/:stationId", async (req,res)=>{
    let id = req.params.stationId
    let premiumSales = Number(req.body.premiumSales)
    let superSales = Number(req.body.superSales)
    let fuelLevelPremium = Number(req.body.fuelLevelPremium)
    let fuelLevelSuper = Number(req.body.fuelLevelSuper)
    let recordSaleDate = new Date(req.body.date)
    let currentDate = new Date();

    if(recordSaleDate <= currentDate){
        let message = await business.updateOneRecordSales(recordSaleDate,id,fuelLevelPremium,fuelLevelSuper,premiumSales,superSales)
        if (message){
            res.redirect(`/manager/${id}/recordSales?message=${message}`)
            return
        }
    }else{
        res.redirect(`/manager/${id}/recordSales?message=You cannot enter data for a future date`)
        return
    }

    res.redirect(`/manager/${id}/recordSales`)
    return
})

app.get("/manager/:stationId/recordSales",  async (req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);
    

    if(!sessionData || sessionData.data.userType!="manager"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }

    let id = req.params.stationId
    if(sessionData.data.userType=="manager"){
        let username = sessionData.data.username;
        let check = await business.checkUser(username,id)
        if(!check){
            let sessionData =await business.startSession({
                userType:"",
                username:""
            });
            await flash.setFlash(sessionData.sessionKey,"Please Login")
            res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
            res.redirect("/login");
            return             
        }
    }

    let message = req.query.message
    let username = sessionData.data.username
    let userId = await business.findUserId(username)

    res.render("recordSales", {
        layout: 'manager_coureUI',
        id: id,
        message:message,
        userId:userId
    })
})

app.get("/check-records/:stationId",  async (req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);

    if(!sessionData || sessionData.data.userType!="manager"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }

    let id = req.params.stationId
    if(sessionData.data.userType=="manager"){
        let username = sessionData.data.username;
        let check = await business.checkUser(username,id)
        if(!check){
            let sessionData =await business.startSession({
                userType:"",
                username:""
            });
            await flash.setFlash(sessionData.sessionKey,"Please Login")
            res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
            res.redirect("/login");
            return             
        }
    }    

    let username = sessionData.data.username
    let userId = await business.findUserId(username)
    let date = new Date(req.query.recordDate)
    let data = await business.findDailyRecord(date, req.params.stationId)
    res.render("recordData", {
        layout: 'manager_coureUI',
        date: date.toLocaleDateString(),
        data: data,
        id: req.params.stationId,
        userId:userId
    })
})

app.get("/api/dailyRecords/:date/:id",async(req,res)=>{
    let date = req.params.date
    let id = req.params.id
    let data = await business.findDailyRecord(date, id)
    if(!data){
        res.send({})
        return
    }
    res.send(data)
    return
})




app.get("/manager/:stationId/checkRecords",  async (req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);

    if(!sessionData || sessionData.data.userType!="manager"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }

    let id = req.params.stationId
    
    if(sessionData.data.userType=="manager"){
        let username = sessionData.data.username;
        let check = await business.checkUser(username,id)
        if(!check){
            let sessionData =await business.startSession({
                userType:"",
                username:""
            });
            await flash.setFlash(sessionData.sessionKey,"Please Login")
            res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
            res.redirect("/login");
            return             
        }
    }    
    let username = sessionData.data.username
    let userId = await business.findUserId(username)
    res.render("checkRecords", {
        layout: 'manager_coureUI',
        id: req.params.stationId,
        userId:userId
    })
})


//admin

app.get("/admin",async(req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);

    if(!sessionData || sessionData.data.userType!="admin"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }

    let username = sessionData.data.username
    let userId = await business.findUserId(username)
    let totalUsers = await business.countUsers()
    let totalManagers = await business.countManagers()
    let totalSales = await business.getTotalSales();
    let averageSales = await business.getAverageSales();
    let lowFuelStations = await business.getLowFuelStations();
    let stationNames = await business.getStationNames();
    
    res.render("adminDashboard",{
        layout:'admin_layout',
        totalUsers:totalUsers,
        totalManagers:totalManagers,
        totalSales:totalSales,
        averageSale:averageSales,
        lowFuelStations : lowFuelStations,
        stationNames:stationNames,
        userId: userId
    })
})

app.get("/admin/profile",async (req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);

    if(!sessionData || sessionData.data.userType!="admin"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }

    let username = sessionData.data.username
    let [email, phone] = await business.getUserContacts(username)
    let userId = await business.findUserId(username)
    res.render('profileView', {
        layout: 'admin_layout',
        username: username,
        email: email,
        phone: phone,
        userId: userId
    })
})

app.get("/admin/userAccounts",async (req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);
    let username = sessionData.data.username
    let userId = await business.findUserId(username)

    if(!sessionData || sessionData.data.userType!="admin"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }

    let standardUsers = await business.getAllStandardUsers();
    let managerUsers = await business.getAllManagerUsers();
    res.render("userAccounts",{
        link:"User Accounts",
        layout:"admin_layout",
        standardUsers:standardUsers,
        managerUsers:managerUsers,
        userId: userId
    })

})

app.get("/admin/assignManager",async (req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);
    let username = sessionData.data.username
    let userId = await business.findUserId(username)

    if(!sessionData || sessionData.data.userType!="admin"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }
    
    let standardUsers = await business.getAllStandardUsers();
    let stationNames = await business.getStationNames();
    res.render("assignManager",{
        layout:"admin_layout",
        standardUsers:standardUsers,
        stationNames:stationNames,  
        userId: userId  
    })
})

app.post("/admin/assignManager",async (req,res)=>{
    let obj = req.body;
    let ids = Object.keys(obj)
    ids.splice(ids.indexOf('stations'), 1)
    let stations = obj.stations
    let assignStationList =[]    
    for(let i = 0; i<ids.length;i++){
        let stationID = stations[i]
        let userName = ids[i]
        assignStationList.push({userName:userName.toLowerCase(),stationID:stationID})
    }
    await business.assignManager(assignStationList)
    
    res.redirect("/admin/assignManager")
})

app.get("/admin/stat",async (req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);
    let username = sessionData.data.username
    let userId = await business.findUserId(username)

    if(!sessionData || sessionData.data.userType!="admin"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }
    let stationNames = await business.getStationNames()
    res.render("stat",{layout:"admin_layout",stationNames:stationNames,userId:userId})
})

app.get('/admin/addStation',async(req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);
    let username = sessionData.data.username
    let userId = await business.findUserId(username)

    if(!sessionData || sessionData.data.userType!="admin"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }
    let records = await business.getAllRecords()
    let idNum = 1+records.length
    res.render('addStation',{layout:"admin_layout",idNum:idNum,userId:userId})
})

app.post('/addStation-form',async(req,res)=>{
    let name = req.body.name;
    let ID = req.body.stationID;
    let flp=Number(req.body.fuelLevelPremium)
    let fls=Number(req.body.fuelLevelSuper)
    let fps=Number(req.body.fuelPriceSuper)
    let fpp=Number(req.body.fuelPricePremium)
    let sale=0
    let loc=req.body.location
    let managers=[]
    let locLink=req.body.locationLink
    await business.addStation(name,ID,flp,fls,fps,fpp,sale,loc,managers,locLink)
    res.redirect('/admin')
})

app.get('/admin/editStation',async(req,res)=>{
    let sessionId = req.cookies.projectkey;
    let sessionData = await business.getSessionData(sessionId);
    let username = sessionData.data.username
    let userId = await business.findUserId(username)

    if(!sessionData || sessionData.data.userType!="admin"){
        let sessionData =await business.startSession({
            userType:"",
            username:""
        });
        await flash.setFlash(sessionData.sessionKey,"Please Login")
        res.cookie('projectkey',sessionData.sessionKey,sessionData.expiry);
        res.redirect("/login");
        return 
    }
    res.render('editStation',{
        layout:"admin_layout",userId:userId
    })
})

app.get('/registerNow',async(req,res)=>{
    let sessionId = req.cookies.projectkey;
    let fm = await flash.getFlash(sessionId);
    let userId = await business.lastUserId()
    res.render('register',{layout:undefined,message:fm,userId:userId})
})

app.use(function404)
app.listen(8000, () => { console.log("Running")})