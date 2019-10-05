// FIXME: TODO - do the below when absorbed into Clickpoint
// NOTE: If deployed locally, this will detect that it's not
// configured by Cloud Foundry, and instead will use the default:
//     User: clickpoint Password: password 
//     Server IP: 127.0.0.1 Database: clickpoint
//   To set up your local database, these two SQL queries may help:
//     create user 'clickpoint'@'localhost' IDENTIFIED BY 'password';
//     grant all privileges on clickpoint.* to 'clickpoint'@'localhost';

var http = require('http') ;
var finalhandler = require('finalhandler') ;
var serveStatic = require('serve-static') ;
var strftime = require('strftime') ;
var time = require('time') ;
var url = require('url') ;
var util = require('util') ;
var mysql = require('mysql') ;
var bindMySQL = require('./bind-mysql.js') ;

// Variables
var port = 8080 ;
var done = undefined ;
var mysql_creds = undefined ;
var vcap_services = undefined ;
var dbClient = undefined ;
var dbConnectState = Boolean(false) ;
var dbConnectTimer = undefined ;

// Setup based on Environment Variables
if (process.env.VCAP_SERVICES) {
    mysql_creds = bindMySQL.getMySQLCreds() ;
}

if (process.env.VCAP_APP_PORT) { port = process.env.VCAP_APP_PORT ; }

// DB-related

var schema = {
    ss_surveys : "(id int AUTO_INCREMENT primary key, name VARCHAR(50) NOT NULL, active BIT(1) DEFAULT b'1')", 
    ss_fields : "(id int AUTO_INCREMENT primary key, surveyID int NOT NULL, name VARCHAR(50), type VARCHAR(50))", 
    ss_results : "(id int AUTO_INCREMENT primary key, surveyID int NOT NULL, IP int unsigned, results VARCHAR(255) NOT NULL)"
} ;

function createOnEmpty(err, results, fields, tableName, create_def) {
    var sql ;
    if (err) {
        console.error(err) ;
        process.exit(1) ;
    } else {
        if (0 == results.length) {
            util.log("Creating table: " + tableName) ;
            sql = util.format("create table %s %s", tableName, create_def) ;
            console.info(sql) ;
            dbClient.query(sql,
                           function (err, results, fields) {
                               if (err) {
                                   util.log("create table error: "
                                               + JSON.stringify(err))}
                           } ) ;
        } else {
            util.log("  [schema] " + tableName + " table already exists.") ;
        }
    }
}

function setupSchema() {
    for (table in schema) {
        // Create a closure to handle re-using table for each in the array.
        (function (table) {
            dbClient.query("show tables LIKE '" + table + "'",
                           function (err, results, fields) {
                               createOnEmpty(err, results, fields,
                                             table, schema[table])
                           } ) ;
        })(table) ;
    }
}
    
function MySQLConnect() {
    clientConfig = {
        host : mysql_creds["host"],
        user : mysql_creds["user"],
        password : mysql_creds["password"],
        port : mysql_creds["port"],
        database : mysql_creds["database"]
    } ;
    if (mysql_creds["ca_certificate"]) {
        console.log("CA Cert detected; using TLS");
        clientConfig["ssl"] = { ca : mysql_creds["ca_certificate"] } ;
    }
    dbClient = mysql.createConnection( clientConfig ) ;
    dbClient.connect(handleDBConnect) ;
}

function dbError(response, error) {
    console.error("ERROR getting values: " + error) ;
    response.end("ERROR getting values: " + error) ;
}
    
function errorDbNotReady(request, response) {
    console.error("ERROR: Database is Not Ready") ;
    errHTML = "<title>Error</title><H1>Error</H1>\n"
    errHTML += "<p>Database info is not set or DB is not ready<br>\n" ;
    errHTML += "<hr><A HREF=\"" + url.resolve(request.url, "/dbstatus") + "\">/dbstatus</A>\n" ;
    response.end(errHTML) ;
}

function handleDBerror(err) {
    if (err) {
        console.warn("Issue with database, " + err.code
                     + ". Attempting to reconnect every 1 second.")
        setTimeout(MySQLConnect, 1000) ;
    }
}

function handleDBConnect(err) {
    if (err) {
        dbConnectState = false ;
        console.error("ERROR: problem connecting to DB: " + err.code +
                      ", will try again every 1 second.") ;
        dbConnectTimer = setTimeout(MySQLConnect, 1000) ;
    } else {
        util.log("Connected to database.") ;
        dbClient.on('error', handleDBerror) ;
        dbConnectState = true ;
        if (dbConnectTimer) {
            clearTimeout(dbConnectTimer) ;
            dbConnectTimer = undefined ;
        }
        setupSchema() ;
    }
}

function handleSQLerr(response, err, errStr) {
    response.writeHead(500) ;
    console.error("SQL ERROR: " + JSON.stringify(err)) ;
    response.end("Internal Server Error: " + errStr) ;
}

// Callback functions

function resultsWrite_CB(response) {
    function cb(err, results, fields) {
        if (err) {
            console.error("SQL ERR: " + JSON.stringify(err)) ;
            response.writeHead(500) ;
            response.end("Internal Server Error: unable to record response.") ;
        } else {
            console.info("DB response: %s" + JSON.stringify(results)) ;
            response.writeHead(200) ;
            response.end("Thank you! Your response has been recorded. You can close this window now.") ;
        }
    }
    return(cb) ;
}

function insertResults(response, requestIP, surveyID, inputs) {
    var values = [] ;
    for (i in inputs) { values.push(inputs[i]) ; }
    sql = util.format("insert into ss_results VALUES (NULL, %s, INET_ATON('%s'), '%s')",
                      surveyID, requestIP, JSON.stringify(values)) ;
    console.info("insertResults SQL: " + sql) ;
    dbClient.query(sql, resultsWrite_CB(response)) ;
}

function getSurveyProtoByID_CB(response) {
    function cb(err, results, fields) {
        var surveyFields = [] ;
        if (err) {
            console.error("SQL ERR: " + err) ;
            response.writeHead(500) ;
            response.end("Internal Server Error: unable to fetch survey proto.") ;
        }
        console.info("DB response is: %s" + JSON.stringify(results)) ;
        for (i in results) {
            surveyFields.push([ results[i]["name"], results[i]["type"] ]) ;
        }
        response.writeHead(200) ;
        response.end(JSON.stringify(surveyFields)) ;
    }
    return(cb) ;
}

function getSurveyProtoByID(response, requestIP, surveyID, inputs) {
    sql = "select name,type from ss_fields where surveyID=" + surveyID ;
    console.info("getSurveyProtoByID SQL: " + sql ) ;
    dbClient.query(sql, getSurveyProtoByID_CB(response)) ;
}

function surveyName_CB(response, requestIP, inputs, nextFcn) {
    console.log("Production callback for surveyName") ;
    function cb(err, results, fields) {
        var surveyID ;
        if (err) { handleSQLerr(response, "survey name not found: " + err) ; }
        else if (1 <= results.length) {
            console.log("results length: " + results.length) ;
            surveyID = results[0]["id"] ;
            nextFcn(response, requestIP, surveyID, inputs) ;
        } else if (0 <= results.length) {
            console.log("results length: " + results.length) ;
            response.writeHead(404) ;
            response.end("The survey you've submitted doesn't seem to be active.") ;
        }
    } ;
    return(cb) ;
}

function getSurveyID(response, requestIP, surveyName, inputs, nextFcn) {
    var sql ;

    if (dbConnectState) {
        sql = util.format("select id from ss_surveys WHERE name = '%s' AND active = b'1'", surveyName) ;
        console.info("getSurveyID SQL: " + sql) ;
    
        dbClient.query(sql, surveyName_CB(response, requestIP, inputs, nextFcn)) ;
    } else {
        response.writeHead(500) ;
        response.end("Internal Server Error: database connection not ready.") ;
    }
}

// API Endpoints

function writeSurveyInput(response, requestIP, surveyName, inputs) {
    getSurveyID(response, requestIP, surveyName, inputs, insertResults) ;
}

function getSurveyProto(response, surveyName) {
    getSurveyID(response, null, surveyName, null, getSurveyProtoByID) ;
}

function dispatchApi(request, response, requestIP, method, requestPath, query) {
    switch (method) {
    case "dbstatus":
        response.end(JSON.stringify({"dbStatus":dbConnectState})) ;
        break ;
    case "getProto":
        if (query["survey"]) {
            console.log("Received request for survey proto: " + query["survey"]) ;
            getSurveyProto(response, query["survey"]) ;
        } else {
            response.end("ERROR: Usage: /json/getProto?survey=survey-name"
                         + " (request: " + request.url + ")") ;
        }
        break ;
    case "write":
        if (4 === requestPath.length) {
            surveyName = requestPath[requestPath.length-1] ;
            writeSurveyInput(response, requestIP, surveyName, requestParts["query"]) ;
        } else {
            console.warn("Invalid survey request: " + request.url) ;
            response.writeHead(400) ;
            response.end("ERROR: Usage: /json/write/survey-name?values...") ;
        }
        break ;
    default:
        response.writeHead(404) ;
        response.end(false) ;
    }
    
}
// ---

function requestHandler(request, response, done) {
    var requestIP = undefined ;
    requestParts = url.parse(request.url, true) ;
    requestPath = requestParts["pathname"].split('/') ;
    rootCall = requestParts["pathname"].split('/')[1] ;
    util.log("Recieved request for: " + rootCall) 
    if (request.headers["x-forwarded-for"]) {
        requestIP = request.headers["x-forwarded-for"].split(',')[0] ;
    }

    switch (rootCall) {
    case "json":
        var method = requestParts["pathname"].split('/')[2] ;
        dispatchApi(request, response, requestIP, method,
                    requestPath, requestParts["query"]) ;
        return(true) ;
        break ;
    case "dbstatus":
        if (dbConnectState) {
            doStatus(request, response) ;
        } else {
            response.end("I'm sorry, Dave, I can't do that. No connection to database.") ;
        }
        break ;
    default:
        console.log("Unhandled request: " + request.url + ", falling through.") ;
        done() ;
    }
}

// MAIN

MySQLConnect() ;
    
var staticServer = serveStatic("static") ;
clickPointServer = http.createServer(function(req, res) {
    var done = finalhandler(req, res) ;
    staticServer(req, res, function () {requestHandler(req, res, done)}) ;
}) ;

clickPointServer.listen(port) ;

util.log("Server up and listening on port: " + port) ;
