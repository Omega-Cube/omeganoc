"use strict"

define([], function() {
    var _baseUrl = null;
    var _separator = null;
    var _isAdmin = false;
    var _shinkenContact = false;

    return {
        baseUrl: function() {
            return _baseUrl;
        },

        separator: function() {
            return _separator;
        },

        isAdmin: function() {
            return _isAdmin;
        },

        shinkenContact: function() {
            return _shinkenContact;
        },

        setValues: function(baseUrl, separator, isAdmin, shinkenContact) {
            _baseUrl = baseUrl;
            _separator = separator;
            _isAdmin = isAdmin;
            _shinkenContact = shinkenContact;
        }
    };
});