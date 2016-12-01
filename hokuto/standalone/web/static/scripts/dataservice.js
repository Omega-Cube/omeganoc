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

define(['jquery', 'onoc.createurl'], function (jQuery, createUrl) {
    var DataService = {
        getData: function (request,successCallback, errorCallback){
            jQuery.getJSON(createUrl('/services/data/get/'), request,function (data) {
                successCallback(data);
            }).fail(function() {
                if(errorCallback)
                    errorCallback();
            });
        },
        getHostsList: function (successCallback, errorCallback) {
            jQuery.getJSON(createUrl('/services/livestatus/get/hosts'), function (data) {
                data = data.results;
                // Build a dictionnary of hosts indexed by host name
                var result = {};
                for (var i = 0, c = data.length; i < c; ++i) {
                    result[data[i].name] = data[i];
                }
                successCallback(result);
            }).fail(function () {
                if (errorCallback)
                    errorCallback();
            });
        },

        getServicesList: function (successCallback, errorCallback) {
            jQuery.getJSON(createUrl('/services/livestatus/get/services'), function (data) {
                data = data.results;
                // Build a dictionnary of services indexed by name.
                // And this dictionnary will contain other dictionnaries indexed by host name
                var result = {};
                for (var i = 0, c = data.length; i < c; ++i) {
                    var s = data[i];
                    if (!(s.descrption in result))
                        result[s.descrption] = {};
                    result[s.descrption][s.host_name] = data;
                }
                successCallback(result);
            }).fail(function () {
                if (errorCallback)
                    errorCallback();
            });
        },

        getHost: function (name, successCallback, errorCallback) {
            jQuery.getJSON(createUrl('/services/livestatus/get/hosts'), { 'name': name }, function (data) {
                data = data.results;

                if (data.length === 0)
                    successCallback(null);
                else
                    successCallback(data[0]);
            }).fail(function () {
                if (errorCallback)
                    errorCallback();
            });
        },

        getService: function (hostName, serviceName, successCallback, errorCallback) {
            jQuery.getJSON(createUrl('/services/livestatus/get/services'), { 'host_name': hostName, 'description': serviceName }, function (data) {
                data = data.results;

                if (data.length === 0)
                    successCallback(null);
                else
                    successCallback(data[0]);
            }).fail(function () {
                if (errorCallback)
                    errorCallback();
            });
        }
    };

    return DataService;
});
