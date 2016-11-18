"use strict"
/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Nicolas Lantoing, nicolas@omegacube.fr
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Worker used to store, aggregate and manage probes Data for the Dashboard
 * @prop {String} BASE_URL - URL to be used on each request by @._request
 */

//var BASE_URL = false;
// var ONOC = {
//     'separator': '[SEP]'
// };
/**
 * AJAX request handler
 * @function
 * @param {String} service    - Target part of the request URL
 * @param data                - Request params
 * @param {Function} callback - Function to be called on success
 */
// var _request = function(service,data,callback){
//     if(service.length > 0 && service[0] == '/') {
//         service = service.slice(1);
//     }
//     var xhr = new XMLHttpRequest();
//     if(data && typeof data !== 'string'){
//         var queryStringParts = []
//         for(var key in data) {
//             var val = data[key];
//             if(Array.isArray(val)) {
//                 for(var i in val) {
//                     queryStringParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(val[i]));
//                 }
//             }
//             else {
//                 queryStringParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
//             }
//         }
//         data = queryStringParts.join('&');
//     }
//     if(data)
//         xhr.open('GET',BASE_URL.concat(service,'?',data),true);
//     else
//         xhr.open('GET',BASE_URL.concat(service),true);

//     xhr.onreadystatechange = function(aEvt){
//         if(xhr.readyState === 4){
//             if(xhr.status === 200)
//                 callback(JSON.parse(xhr.response));
//             else
//                 postMessage([9001,"Error on _request ".concat(service).concat(" with status ",xhr.status)]);
//         }
//     };
//     xhr.send(null);
//     return true;
// };


require(['workers/probes.data'], function(Data) {
    /**
     * Control room
     */
    onmessage = function(m){
        if(typeof m.data !== 'object' || (!m.length && m.length < 2)){
            console.log('Passed object must be an array of two or more values!');
            return false;
        }

        var data = m.data[1];
        var sig = m.data[2];
        /*
        1: set baseURL for ajax requests
        2: add probe
        3: fetch data
        4: fetch single probe data
        5: fetch single log data
        6: get data (will return also timeline and min/max available)
        7: update timeline
        8: check if new aggregation scale reached with given timeline.
        9: Get cursor data
        10: Get logs data
        11: Delete part
        */
        switch(m.data[0]) {
        // case 1:
        //     BASE_URL = data[0];
        //     ONOC.separator = data[1];
        //     break;
        case 2:
            Data.addProbe(data);
            break;
        case 3:
            Data.fetch(data, sig);
            break;
        case 4:
            //TODO: not functional yet
            Data.fetchProbe(data);
            break;
        case 5:
            Data.fetchLog(data);
            break;
        case 6:
            Data.get(data, sig);
            break;
        case 7:
            if(!data.start && !data.end)
                return false;
            if(Data.getTimeline(data, sig))
                postMessage([0, "New fromDate require to fetch new data"]);
            break;
        case 8:
            var aggregate = Data.checkAggregate(data, sig);
            if(aggregate)
                postMessage([8, aggregate, sig]);
            break;
        case 9:
            var results = Data.getCursor(data);
            postMessage([9, {
                'values': results,
                'date': data
            }]);
            break;
        case 10:
            var logs = Data.getLogs(data,sig);
            if(logs)
                postMessage([10,logs]);
            break;
        default:
            postMessage("Errrr dunno what to do with this crap or forgot to set a break statement. " + m.data[0]);
            break;
        }
    };
});