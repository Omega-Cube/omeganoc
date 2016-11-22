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
require(['jquery','onoc.createurl'], function (jQuery, createurl) {
    jQuery(document).ready(function() {
        jQuery('.unitlist').find('.unit').each(function(index){
            var id = jQuery(this).data('id');
            var container = jQuery(this);
            jQuery(this).find('.delete').click(function(){
                jQuery.ajax(createurl("/units/delete/"+id),{
                    'type': 'DELETE'
                }).success(function(response){
                    container.remove();
                }).error(function(response){
                    console.error("Delete unit request failed!",response);
                });
            });
        });
    });
});
