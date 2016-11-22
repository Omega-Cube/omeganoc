'use strict';

/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2015 Omega Cube and contributors
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
define(['jquery', 'console', 'libs/select2', 'libs/jquery.validate'], function(jQuery, Console){
    jQuery(function() {
        jQuery('#conf-apply-changes').click(function() {
            jQuery.ajax('/config/apply', {
                'method': 'POST',
            }).success(function(response) {
                if(!response.success) {
                    alert(response.error);
                } 
                else {
                    alert('Shinken will restart with the new configuration in less than one minute.');
                }
            }).error(function(response) {
                Console.error('The configuration service responded to the apply call with an error: ' + response);
                alert('An error occured; Maybe try again later ?');
            });
        });

        jQuery('#conf-reset-changes').click(function(){
            jQuery.ajax('/config/reset',{
                'method': 'DELETE',
            }).success(function() {
                document.location.reload();
            }).error(function(response){
                Console.error('The configuration service responded to the reset call with an error: ' + response);
                alert('An error occured; Maybe try again later ?');
            });
        });

        jQuery('#conf-lock').click(function(){
            jQuery.ajax('/config/lock').success(function(){
                document.location.reload();
            }).error(function(response) {
                Console.error('The configuration service responded to the lock call with an error: ' + response);
                alert('An error occured; Maybe try again later ?');

            });
        });

        
        // Select2 lists
        jQuery('select[multiple]').select2({
            width: '400px',
            placeholder: 'Empty list',
        });

        // Open / collapse fieldsets
        jQuery('form > fieldset > legend').click(function() {
            jQuery(this).parent().toggleClass('collapsed');
        });
    });
});
