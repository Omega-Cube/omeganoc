'use strict';

/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Xavier Roger-Machart, xrm@omegacube.fr
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
require(['jquery', 'console', 'onoc.createurl'], function (jQuery, Console, createUrl) {
    /**
     * Adds a new link in the "Dashboards" drop down menu
     * @param {String} name
     */
    var addTopMenuEntry = function (name) {
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
    };

    /**
     * Edit an entry from the Dashboards dropdown menu
     * @param {String} oldName
     * @param {String} newName
     */
    var editTopMenuEntry = function (oldName, newName) {
        var entries = jQuery('#menu-dashboards-list a');
        entries.each(function (i, elm) {
            var jqElm = jQuery(elm);
            if (jqElm.text() == oldName) {
                jqElm.text(newName);
                jqElm.attr('href', createUrl('/dashboards') + '#' + encodeURIComponent(newName));
            }
        });
    };

    /**
     * Delete an entry from the Dashboards dropdown menu
     * @param {String} name
     */
    var deleteTopMenuEntry = function (name) {
        var entries = jQuery('#menu-dashboards-list a');
        entries.each(function (i, elm) {
            var jqElm = jQuery(elm);
            if (jqElm.text() == name) {
                jqElm.remove();
            }
        });
        if(!(entries.length - 1)){
            var link = jQuery('<a href="'+createUrl('/dashboards')+'"></a>');
            var current = jQuery('#menu-dashboards-list').parent().children().first();
            link.text(current.text());
            current.replaceWith(link);
            jQuery('#dashboards-list').append('<li class="no-dashboard"><a href="'+createUrl('/dashboards')+'">You have no dashboards yet</a></li>');
        }
    };

    jQuery(document).ready(function(){

        var dblist = jQuery('#dashboards-list');

        //setup delete buttons
        dblist.find('.delete').each(function(index,element){
            jQuery(element).click(function(event){
                var target = jQuery(event.target);
                var name = target.parent().data('db');
                jQuery.ajax({
                    'url': createUrl('/dashboards/' + name),
                    'type': 'DELETE'
                }).success(function(){
                    target.parent().remove();
                    deleteTopMenuEntry(name);
                }).error(function(e){
                    Console.error('An error occured while removing the dashboard "' + name + '": ' + e);
                });
            });
        });

        //setup rename buttons
        dblist.find('.edit').each(function(index,element) {
            jQuery(element).click(function(event) {
                var target = jQuery(event.target);
                var dbname = target.parent().find('.name');
                var name = target.parent().data('db');
                var form = jQuery('<form action="#" name="renamedb"><input type="text" name="dbname" class="name" value="'+name+'"/><input class="submit" type="submit" value="ok"/></form>');
                form.submit(function(e) {
                    e.preventDefault();
                    var newname = form[0].dbname.value;
                    if(newname !== name){
                        dbname.text(newname);
                        jQuery.ajax({
                            'url': createUrl('/dashboards'),
                            'type': 'POST',
                            'data': {
                                'oldname': name,
                                'newname': newname
                            }
                        }).success(function(){
                            editTopMenuEntry(name,newname);
                            target.parent().data('db',newname);
                        });
                    }
                    form.replaceWith(dbname);
                    return false;
                });
                dbname.replaceWith(form);
            });
        });
    });
});
