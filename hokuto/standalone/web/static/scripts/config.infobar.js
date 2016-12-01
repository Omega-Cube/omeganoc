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

// Centralizes processing related to the configuration state bar, used in several of the configuration pages

define(['jquery', 'config.service'], function(jQuery, ConfigService) {
    return function() {
        jQuery('#conf-apply-changes').click(function() {
            ConfigService.apply().then(function(service_changed) {
                if(service_changed) {
                    alert('Shinken will restart with the new configuration in less than one minute.\nBe aware that you have changed some services names, if you don\'t want to lose their data you have to move them manually from /opt/graphite/storage/whisper.');
                }
                else {
                    alert('Shinken will restart with the new configuration in less than one minute.');
                }
            }).catch(function() {
                alert('An error occured while applying the changes. Maybe try again later?');
            });
        });

        jQuery('#conf-reset-changes').click(function() {
            ConfigService.reset().then(function() {
                document.location.reload();
            }).catch(function() {
                alert('An error occured during the reset operation. Maybe try again later?');
            });
        });

        jQuery('#conf-lock').click(function(){
            ConfigService.lock().then(function() {
                document.location.reload();
            }).catch(function() {
                alert('An error occured while locking the configuration. Maybe try again later?');
            });
        });
    };
});