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

require(['jquery', 'console', 'onoc.createurl', 'topmenu'], function (jQuery, Console, createUrl, TopMenu) {
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
                    TopMenu.dashboards.delete(name);
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
                var form = jQuery('<form action="#" name="renamedb"><input type="text" name="dbname" class="name" value="' + name + '"/><input class="submit" type="submit" value="ok"/></form>');
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
                            TopMenu.dashboards.rename(name,newname);
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
