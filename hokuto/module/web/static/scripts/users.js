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
        //bind buttons actions
        $('#mainContent').find('.block').on('click',function(e){
            $.ajax(createurl('/block-user/'+e.target.parentNode.parentNode.dataset['id']),{
                'type': 'PUT'
            }).success(function(){
                document.location.reload();
            }).error(function(e){ console.error(e);});
        });
        $('#mainContent').find('.delete').on('click',function(e){
            $.ajax(createurl('/delete-user/'+e.target.parentNode.parentNode.dataset['id']),{
                'type': 'DELETE'
            }).success(function(){
                document.location.reload();
            }).error(function(e){ console.error(e);});
        });

        if(typeof _ISNEW !== 'undefined'){
            require(['jquery.validate'],function(){
                $("#edit_userScreen").validate({
                    rules: {
                        username: {
                            required: (_ISNEW) ? true:false,
                            minlength: 4,
                            maxlength: 20
                        },
                        password: {
                            required: (_ISNEW) ? true : false
                        },
                        confirm_password: {
                            required: (_ISNEW) ? true : false,
                            equalTo: "#password"
                        }

                    },
                    messages: {
                        username: {
                            required: "Please entrer a username",
                            minlength: "Username should contain between 4 and 20 characters",
                            maxlength: "Username should contain between 4 and 20 characters"
                        },
                        password: {
                            required: "Please entrer a password"
                        },
                        confirm_password: {
                            equalTo: "Passwords must match"
                        }
                    }

                });
            });
        }
    });
});
