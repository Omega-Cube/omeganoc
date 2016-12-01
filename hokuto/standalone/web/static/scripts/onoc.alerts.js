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

define(['jquery','onoc.createurl','onoc.states'],function(jQuery,createUrl,OnocStates){

    /**
     * Handle alerts, warnings and notifications display
     */
    var OnocAlerts = {
        warnings: [],
        critical: [],
        container: {
            main: jQuery('header .alerts'),
            warnings: jQuery('header .alerts .warnings'),
            errors: jQuery('header .alerts .critical')
        },

        /**
         * Construct containers and bind events
         */
        _init: function() {
            //refresh alerts when hosts/services states are updated
            jQuery(document).on('updated.states.onoc', this.getAlerts.bind(this));

            //TODO: Refactoring; the warning and error sections are very similar

            //warning
            this.container.warnings.on('mouseenter',function() {
                if(!this.warnings.length) 
                    return;
                this.container.warnings.removeClass('new');

                var details = jQuery('.alerts .details');
                if(details)
                    details.remove();

                details = jQuery('<div class="details warnings"><p class="legend"><span>Host</span><span>Service</span><span>Output</span><span>Last check</span><span>Next check</span></p></div>');
                var length = this.warnings.length;
                for(var d in this.warnings)
                    details.append(this._buildAlertEntry(this.warnings[d]));
                this.container.main.append(details);
                var height = length * 30 + 20;
                if(height > document.body.clientHeight - 120)
                    height = document.body.clientHeight - 120;
                setTimeout(function() { 
                    details.attr('style','height:'+height+'px;');
                },10);
            }.bind(this));

            //errors
            this.container.errors.on('mouseenter',function(){
                if(!this.critical.length) return;
                this.container.errors.removeClass('new');

                var details = jQuery('.alerts .details');
                if(details)
                    details.remove();

                details = jQuery('<div class="details critical"><p class="legend"><span>Host</span><span>Service</span><span>Output</span><span>Last check</span><span>Next check</span></p></div>');
                var length = this.critical.length;
                for(var d in this.critical)
                    details.append(this._buildAlertEntry(this.critical[d]));
                this.container.main.append(details);
                var height = length * 30 + 20;
                if(height > document.body.clientHeight - 120)
                    height = document.body.clientHeight - 120;
                setTimeout(function(){ details.attr('style','height:'+height+'px;');},10);
            }.bind(this));

            //hidding details when leaving the alerts arez
            this.container.main.on('mouseleave',function(){
                var details = jQuery('.alerts .details');
                if(details)
                    details.remove();
            });

        },

        /**
         * Create the line for each alert
         */
        _buildAlertEntry: function(data){
            var container = jQuery('<p class="entry"></p>');
            container.append('<span>'+data.host+'</span>');
            container.append('<span>'+(data.service || '')+'</span>');
            container.append('<span>'+data.output+'</span>');

            var next_check = (data.next_check) ? new Date(data.next_check).toLocaleTimeString() : 'unknown';
            var last_check = (data.last_check) ? new Date(data.last_check).toLocaleTimeString() : 'unknown';

            container.append('<span>'+last_check+'</span>');
            container.append('<span>'+next_check+'</span>');

            return container;
        },

        /**
         * merge new alerts received with old ones
         * return an array of news alert or false
         */
        _haveNewAlerts: function(old,current){
            if(!current.length)
                return false;

            if(!old.length && current.length)
                return true;

            for(var a in current){
                var isnew = true;
                var alert = current[a];
                for(var c in old){
                    if(alert.host === old[c].name || alert.service === old[c].service ){
                        isnew = false;
                        break;
                    }
                }
                if(isnew) break;
            }
            return isnew;
        },

        /**
         * Fetch services and hosts status from the server
         */
        getAlerts: function(){
            var alerts = OnocStates.getAlerts();

            var newWarning = this._haveNewAlerts(this.warnings, alerts.warnings);
            if(newWarning)
                this.container.warnings.addClass('new');
            else if(!alerts.warnings.length)
                this.container.warnings.removeClass('new');

            var newCritical = this._haveNewAlerts(this.critical, alerts.critical);
            if(newCritical)
                this.container.errors.addClass('new');
            else if(!alerts.critical)
                this.container.errors.removeClass('new');

            this.warnings = alerts.warnings;
            this.critical = alerts.critical;

            this.container.warnings.find('small').html(this.warnings.length);
            this.container.errors.find('small').html(this.critical.length);
        }
    };

    OnocAlerts._init();
    return OnocAlerts;
});
