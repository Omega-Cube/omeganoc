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

define(['libs/rsvp', 'onoc.createurl', 'onoc.xhr'], function(RSVP, createUrl, OnocXhr) {
    var DashboardService = {
        list: function() {
            return OnocXhr.getJson(createUrl('/dashboards/list'));
        },

        details: function(dashboardName) {
            // This service answers with a 404 if the name doesn't exist;
            // Turn the 404 error into a non-error with a null result.
            return new RSVP.Promise(function(resolve, reject) {
                OnocXhr.getJson(createUrl('/dashboards/details/' + encodeURI(dashboardName))).then(function(data) {
                    resolve(data);
                }).catch(function(error) {
                    if(error.status === 404) {
                        // Special case : dashboardName doesn't exist
                        resolve(null);
                    }
                    else {
                        reject(error);
                    }
                });
            });
        },

        rename: function(oldName, newName) {
            return OnocXhr.post(createUrl('/dashboards'), {
                oldname: oldName,
                newname: newName,
            });
        },

        savePart: function(partData) {
            return new RSVP.Promise(function(resolve, reject) {
                if(!partData.id && !partData.conf) {
                    reject('Nothing to save in that part');
                }
                else {
                    var originalConf = null;
                    if(partData.conf) {
                        originalConf = partData.conf;
                        partData.conf = JSON.stringify(partData.conf);
                    }

                    OnocXhr.postJson(createUrl('/dashboards/part'), partData).then(function(response) {
                        if(response.conf)
                            response.conf = JSON.parse(response.conf);

                        resolve(response);
                    }).catch(function(xhr) {
                        reject(xhr);
                    });

                    if(originalConf)
                        partData.conf = originalConf;
                }
            });
        },

        removePart: function(partId) {
            return OnocXhr.delete(createUrl('/dashboards/part/' + partId));
        }, 

        removeDashboard: function(dashboardName) {
            return OnocXhr.delete(createUrl('/dashboards/' + dashboardName));
        },

        removePartKeys: function(partId, probeName, scaleName) {
            var post = {};
            if(probeName)
                post.probe = probeName;
            if(scaleName)
                post.scale = scaleName;
            return OnocXhr.delete(createUrl('/dashboards/part/' + partId + '/keys'), post);
        },

        removePartScale: function(partId, scaleName) {
            return DashboardService.removePartKeys(partId, null, scaleName);
        },
    };

    return DashboardService;
});