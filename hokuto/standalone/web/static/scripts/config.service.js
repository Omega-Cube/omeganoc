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