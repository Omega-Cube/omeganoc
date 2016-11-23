'use strict';
/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Xavier Roger-Machart, xrm@omegacube.fr
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
define(['jquery'], function(jQuery) {
    var popupButton = function() {
        var targets = jQuery('[data-popup-button]');
        
        targets.each(function() {
            var jqThis = jQuery(this);
            var type = jqThis.data('popup-button');
            var parent = jqThis.parent();
            
            if(type == 'click') {
                parent.click(function(e) {
                    jqThis.show();
                    e.preventDefault();
                });
            }
            
            parent.mouseleave(function() {
                jqThis.hide();
            });
            
            jqThis.hide();
        });
    };
    
    return popupButton;
});
