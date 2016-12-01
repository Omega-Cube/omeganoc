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

// This module defines simple methods that can be used to call the configuration related web service.
// All methods returns RSVP promises

define(['jQuery', 'console', 'onoc.createurl', 'libs/rsvp'], function(jQuery, Console, createUrl, RSVP) {
    return {
        reset: function() {
            return new RSVP.Promise(function(resolve, reject) {
                jQuery.ajax(createUrl('/config/reset'), {
                    'method': 'DELETE',
                }).success(function(){
                    resolve();
                }).error(function(response){
                    Console.error('An error was returned by the config/reset service: ', response);
                    reject(response);
                });
            });
        },

        lock: function() {
            return new RSVP.Promise(function(resolve, reject) {
                jQuery.ajax('/config/lock').success(function() {
                    resolve();
                }).error(function(response){
                    Console.error('An error was returned by the config/lock service: ', response);
                    reject(response);
                });
            });
        },

        apply: function() {
            return new RSVP.Promise(function(resolve, reject) {
                jQuery.ajax('/config/apply',{
                    'method': 'POST',
                }).success(function(response){
                    if(response.success) {
                        resolve(response.service_changed);
                    }
                    else {
                        reject(response.error);
                    }
                }).error(function(response) {
                    Console.error('An error was returned by the config/apply service: ', response);
                    reject(response);
                });
            });
        },

        list: function(typeName, getTemplates) {
            return new RSVP.Promise(function(resolve, reject) {
                var serviceUrl = createUrl('/config/list/' + typeName + (getTemplates ? 'templates' : 's'));
                jQuery.get(serviceUrl).success(function(response) {
                    if(response.success) {
                        resolve(response.data);
                    }
                    else {
                        reject(response);
                    }
                }).error(function(response) {
                    Console.error('An error was returned by the config/list service: ', response);
                    reject(response);
                });
            });
        }
    };
});