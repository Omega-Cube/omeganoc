/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2016 Omega Cube and contributors
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
'use strict';

// TODO: Refactoring, to create a fluent factory for the OnocXHR object instead
// of using statif methods.
// Something like : new OnocXHR.responseType(JSON).send(url) ?

define(['libs/rsvp'], function(RSVP) {
    var OnocXHR = {
        _runXhr: function(verb, url, data, requestDoneCallback) {
            var xhr = new XMLHttpRequest();

            xhr.onreadystatechange = function() {
                if(xhr.readyState === 4) {
                    requestDoneCallback(xhr);
                }
            };

            xhr.open(verb, url);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            if(verb === 'POST')
                xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
            xhr.send(data);
        },

        _createDataString: function(data) {
            if(data) {
                var dataStrParts = [];
                for(var key in data) {
                    if(data[key] instanceof Array) {
                        for(var i in data[key]) {
                            dataStrParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key][i]));
                        }
                    }
                    else {
                        dataStrParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key]));
                    }
                }


                if(dataStrParts.length > 0) {
                    return dataStrParts.join('&').replace(/%20/g, '+');
                }
            }
            return null;
        },

        _handleJsonResponse: function(xhr, resolve, reject) {
            if(xhr.status === 200) {
                var jsonData = null;
                try {
                    jsonData = JSON.parse(xhr.response);
                }
                catch(ex) {
                    reject('Invalid JSON received: "' + xhr.response + '"');
                }
                resolve(jsonData);
            }
            else {
                reject(xhr);
            }
        },

        _handleEmptyResponse: function(xhr, resolve, reject) {
            if(xhr.status === 200) {
                resolve(null);
            }
            else {
                reject(xhr);
            }
        },

        getJson: function(url, data) {
            return new RSVP.Promise(function(resolve, reject) {
                // Prepare outbound data
                var dataString = OnocXHR._createDataString(data);
                if(dataString) {
                    url += '?' + dataString;
                }

                OnocXHR._runXhr('GET', url, null, function(finishedXhr) {
                    OnocXHR._handleJsonResponse(finishedXhr, resolve, reject);
                });
            });
        },

        post: function(url, data) {
            return new RSVP.Promise(function(resolve, reject) {
                var dataString = OnocXHR._createDataString(data);
                OnocXHR._runXhr('POST', url, dataString, function(finishedXhr) {
                    OnocXHR._handleEmptyResponse(finishedXhr, resolve, reject);
                });
            });
        },

        postJson: function(url, data) {
            return new RSVP.Promise(function(resolve, reject) {
                var dataString = OnocXHR._createDataString(data);
                OnocXHR._runXhr('POST', url, dataString, function(finishedXhr) {
                    OnocXHR._handleJsonResponse(finishedXhr, resolve, reject);
                });
            });
        },

        delete: function(url, data) {
            return new RSVP.Promise(function(resolve, reject) {
                var dataString = OnocXHR._createDataString(data);
                if(dataString) {
                    url += '?' + dataString;
                }
                OnocXHR._runXhr('DELETE', url, null, function(finishedXhr) {
                    OnocXHR._handleEmptyResponse(finishedXhr, resolve, reject);
                });
            });
        }
    };

    return OnocXHR;
});
