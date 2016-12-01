'use strict';

// Provides tools to manipulate the top menu of the app

define(['jquery', 'onoc.createurl'], function(jQuery, createUrl) {
    return {
        dashboards: {
            /**
             * Adds a new link in the "Dashboards" drop down menu
             * @param {String} name
             */
            add: function (name) {
                var entryContainer = jQuery('#menu-dashboards-list');

                // Before adding the new entry, make sure that it does not contain the "no dashboards yet" entry
                // remove it if it's here
                var noentry = entryContainer.find('li.no-dashboard');
                noentry.remove();

                // We can now add the link
                var link = jQuery('<a></a>');
                link.text(name);
                link.attr('href', createUrl('/dashboards') + '#' + encodeURIComponent(name));
                var li = link.wrap('<li />').parent();
                entryContainer.append(li);
                return link;
            },

            /**
             * Edit an entry from the Dashboards dropdown menu
             * @param {String} oldName
             * @param {String} newName
             */
            rename: function (oldName, newName) {
                var entries = jQuery('#menu-dashboards-list a');
                entries.each(function (i, elm) {
                    var jqElm = jQuery(elm);
                    if (jqElm.text() === oldName) {
                        jqElm.text(newName);
                        jqElm.attr('href', createUrl('/dashboards') + '#' + encodeURIComponent(newName));
                    }
                });
            },

            /**
             * Delete an entry from the Dashboards dropdown menu
             * @param {String} name
             */
            deleteTopMenuEntry: function (name) {
                var entries = jQuery('#menu-dashboards-list a');
                entries.each(function (i, elm) {
                    var jqElm = jQuery(elm);
                    if (jqElm.text() === name) {
                        jqElm.remove();
                    }
                });
                if(!(entries.length - 1)){
                    var link = jQuery('<a href="' + createUrl('/dashboards') + '"></a>');
                    var current = jQuery('#menu-dashboards-list').parent().children().first();
                    link.text(current.text());
                    current.replaceWith(link);
                    jQuery('#dashboards-list').append('<li class="no-dashboard"><a href="' + createUrl('/dashboards') + '">You have no dashboards yet</a></li>');
                }
            }

        }
    };
});