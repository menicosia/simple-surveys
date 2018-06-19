# Simple Surveys

When receiving a request at a certain path, present a form based on that path. Record the responses. That's it.

All fields are text-only.

A `robots.txt` file is included to prevent well-behaved robots from fussing with the data.

### Example

Visiting http://simple-surveys.cfapps.io/index.html?simple-demo will present a form with two fields: Name and Organization, plus a submit button. When the user clicks submit, they're presented with a **Thank You** page, and the values are recorded in the database.

## Why?

Can we make it _even easier than e-mail_ for a user to give us feedback?

This is intended as the lightest-weight sequence possible to set up and receive micro-bits of feedback from users. When combined with [clickpoint](https://github.com/menicosia/clickpoint), these two apps implement _the minimum possible_ number of steps a user must take to send you feedback.

Don't agree? Let me know!

## Deploying

This is distributed as a Cloud Foundry app, and depends on a MySQL-compatible ([cf-mysql-release](https://github.com/cloudfoundry/cf-mysql-release), cleardb) service instance.

If you don't have access to a Cloud Foundry, you can use [PCF Dev](https://pivotal.io/pcf-dev) on your workstation or hosted Cloud Foundry via [Pivotal Web Services](http://run.pivotal.io/).

If you use the included [manifest.yml](manifest.yml), pushing the app is as simple as:

   1. Optional: cf create-service p-mysql 100mb simple-surveyDB
     - If deploying with clickpoint, just modify the manifest to specify clickpoint's service instance.
   1. cf push

## Future Work

1. It'd be nice to have a `create-survey` endpoint where one could fill out the name and fields of data. For now, this is done manually into the DB.
1. It'd be nice to have a `results` endpoint. For now, this is done manually by viewing the DB directly.
1. ~~Finally, this shouldn't be a separate app from clickpoint. This work should just be collapsed into clickpoint.~~

## Developer Information

Simple Survey stores a few things in the database.

1. A table of active surveys. Each row expresses the ID, name and active state of a survey. The name is used as the URL path.
1. A table of survey fields. Each row expresses the ID of a survey, plus the name of the field. An extra field, type, isn't used at this time.
1. A table of submissions. Each row expresses the ID of the survey and a JSON containing the results. The results are **not relational** because I didn't want to create a new table per survey, and surveys can have totally different entry fields.

### API

Write a record
- http://simple-survey.cfapps.io/sample-survey/write?values...

Retreive JSON of field names
- http://simple-survey.cfapps.io/json/getProto?survey=sample-survey
