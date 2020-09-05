function restHandler(err){
    if (err == "Request failed with status code 504")
    console.error("Error: 504");
    else if (err == "Cannot set property 'OD' of undefined")
    console.error("Error: Cannot set property 'OD' of undefined");
    else
    console.error(err);
}

module.exports = {
    rest: restHandler,
}