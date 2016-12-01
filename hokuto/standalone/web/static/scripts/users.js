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

// TODO: Find a way to get rid of that global somehow
/* globals _ISNEW */

require(['jquery','onoc.createurl', 'console'], function (jQuery, createurl, Console) {

    jQuery(document).ready(function() {
        //bind buttons actions
        jQuery('#mainContent').find('.block').on('click',function(e){
            jQuery.ajax(createurl('/block-user/'+e.target.parentNode.parentNode.dataset['id']),{
                'type': 'PUT'
            }).success(function() {
                document.location.reload();
            }).error(function(e) { 
                Console.error('Error while blocking the user: ' + e);
            });
        });
        jQuery('#mainContent').find('.delete').on('click',function(e){
            jQuery.ajax(createurl('/delete-user/'+e.target.parentNode.parentNode.dataset['id']),{
                'type': 'DELETE'
            }).success(function(){
                document.location.reload();
            }).error(function(e) {
                Console.error('Error while deleting a user: ' + e);
            });
        });

        if(typeof _ISNEW !== 'undefined'){
            require(['libs/jquery.validate'],function(){
                var isNew = !!_ISNEW;
                jQuery('#edit_userScreen').validate({
                    rules: {
                        username: {
                            required: isNew,
                            minlength: 4,
                            maxlength: 20
                        },
                        password: {
                            required: isNew
                        },
                        confirm_password: {
                            required: isNew,
                            equalTo: '#password'
                        }

                    },
                    messages: {
                        username: {
                            required: 'Please entrer a username',
                            minlength: 'Username should contain between 4 and 20 characters',
                            maxlength: 'Username should contain between 4 and 20 characters'
                        },
                        password: {
                            required: 'Please entrer a password'
                        },
                        confirm_password: {
                            equalTo: 'Passwords must match'
                        }
                    }

                });
            });
        }
    });
});
