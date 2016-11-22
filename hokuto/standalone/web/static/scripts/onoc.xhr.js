"use strict"

/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Xavier Roger-Machart <xrm@omegacube.fr>
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

define(['libs/rsvp'], function(RSVP) {
    var OnocXHR = {
        getJson: function(url, data) {
            return new RSVP.Promise(function(resolve, reject) {
                var xhr = new XMLHttpRequest();

                // Prepare outbound data
                if(data) {
                    var dataStrParts = [];
                    for(var key in data) {
                        if(typeof data[key] === 'array') {
                            for(var i in data[key]) {
                                dataStrParts.push(encodeURIComponent(key) + "=" + encodeURIComponent(data[key][i]));
                            }
                        }
                        else {
                            dataStrParts.push(encodeURIComponent(key) + "=" + encodeURIComponent(data[key]));
                        }
                    }

                    if(dataStrParts.length > 0) {
                        // Append the arguments to the url
                        url += '?' + dataStrParts.join('&');
                    }
                }

                xhr.onreadystatechange = function() {
                    if(xhr.readyState === 4) {
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
                    }
                }

                xhr.open('GET', url);
                xhr.send(null);
            });
        },
    };

    return OnocXHR;
});
