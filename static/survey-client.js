// Survey Client - code to access the simple-survey endpoints

var dbStatus = undefined ;
window.onload = function () {
    getDBstatus() ;
}

function getDBstatus() {
    var url = document.baseURI + "json/dbstatus" ;
    var survey = location.search.slice(1) ;
    console.log("URL: " + url) ;
    var request = new XMLHttpRequest() ;
    request.onload = function () {
        if (200 == request.status) {
            q = JSON.parse(request.responseText) ;
            dbStatus = q.dbStatus ;
            // displayDBstatus() ;
            console.log("Survey is: " + survey) ;
            displayForm(document.baseURI, survey) ;
        }
    } ;
    request.open("GET", url) ;
    request.send(null) ;
}

function displayDBstatus() {
    var span = document.getElementById("dbstatus") ;
    span.innerHTML = dbStatus ;
}

function displayForm(apiURI, path) {
    if (dbStatus) {
        var url = apiURI + "json/getProto?survey=" + path;
        var request = new XMLHttpRequest() ;
        request.onload = function () {
            if (200 == request.status) {
                console.log("Got data: " + JSON.stringify(request.response)) ;
                displayFormElements(path, JSON.parse(request.response)) ;
            } else {
                console.log("Failed to get data from server.") ;
            }
        }
        request.open("GET", url) ;
        request.send(null) ;
    } else {
        console.log("dbStatus not true, not loading data: " + dbStatus) ;
    }
}

function displayFormElements(path, proto) {
    // re-write form action to make a RESTful call
    var surveyForm = document.getElementById("sendSurvey") ;
    surveyForm.action = "json/write/" + path ;
    var surveyList = document.getElementById("surveyList") ;
    for (i in proto) {
        var newLI = document.createElement("LI") ;
        var newInput = document.createElement("INPUT") ;
        newInput.setAttribute('type', 'text')
        newInput.name = proto[i] ;
        if (0 == i) {
            newInput.autofocus = true ;
        }
        newLI.appendChild(document.createTextNode(newInput.name + ": ")) ;
        newLI.appendChild(newInput) ;
        surveyList.appendChild(newLI) ;
    }
}
