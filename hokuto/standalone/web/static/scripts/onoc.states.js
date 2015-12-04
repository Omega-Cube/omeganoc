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
define(['jquery','onoc.createurl'],function(jQuery,createUrl){

    /**
     * Handle alerts, warnings and notifications display
     */
    var OnocStates = {
	_states: [],

	/**
	 * Construct containers and bind events
	 */
	_init: function(){
	    this.fetchCurrentStates();
	},

        /**
         * Subscribe to the updated states event.
         * will imediatly trigger the event if data were already fetched.
         */
        subscribe: function(callback){
            jQuery(document).on('updated.states.onoc', callback);
            if(this._states.length)
                jQuery(document).trigger('updated.states.onoc');
        },

	/**
	 * Fetch services and hosts status from the server
	 */
	fetchCurrentStates: function(){
	    var url = createUrl('/services/livestatus/states');
	    $.ajax({
		'url': url,
		'type': 'GET'
	    }).success(function(response){
                //is the conf currently locked by user? if so highlight the correct header section
                if(response.is_conf_owner){
                    var classname = 'alert';
                    if(response.is_conf_owner > 0) classname = 'warning';
                    jQuery('#menu-admin-list').parent().addClass(classname);
                    jQuery('#menu-admin-list .config').addClass(classname);
                }else{
                    jQuery('#menu-admin-list').parent().removeClass('alert warning');
                    jQuery('#menu-admin-list .config').removeClass('alert warning');
                    if(jQuery('.infobox.alert').length){
                        var container = jQuery('.infobox.alert');
                        container.empty();
                        container.removeClass('alert').addClass('success');
                        container.append('<h2>Configuration have been successfully applied</h2>');
                    }
                }

		var tmp = response.results;
		for(var h in tmp){
		    tmp[h]['last_time_up'] *= 1000;
		    tmp[h]['last_check'] *= 1000;
		    tmp[h]['next_check'] *= 1000;
		    for(var s in tmp[h].services){
                        tmp[h]['services'][s] = tmp[h]['services'][s][0];
			tmp[h]['services'][s].last_time_ok *= 1000;
			tmp[h]['services'][s].last_check *= 1000;
			tmp[h]['services'][s].next_check *= 1000;
		    }
		}
		this._states = tmp;

		//notify the update and refresh states every 30s
		$(document).trigger('updated.states.onoc');
		setTimeout(this.fetchCurrentStates.bind(this), 30000);
	    }.bind(this)).error(function(jqxhr,message){
		console.error("States request failed, maybe shinken or hokuto is down.");
                setTimeout(this.fetchCurrentStates.bind(this), 30000);
	    }.bind(this));
	},

	/**
	 * Return all states
	 */
	getStates: function(){
	    return this._states;
	},

	/**
	 * return a host specific sate
	 */
	getHostState: function(host){
	    var result = false;
	    for(var h in this._states){
		if(this._states[h].name === host){
		    result = this._states[h];
		    break;
		}
	    }
	    return result
	},

	/**
	 * return the state of one service
	 * or all services from that host if service is not defined
	 */
	getServicesStates: function(h,service){
	    var host = this.getHostState(h);

            if(!host){
                console.log("No data found for "+h);
                return false;
            }

	    if (!service)
	        return host['services'];

	    if (service in host['services'])
	        return host['services'][service];

	    return false;
	},

	/**
	 * Return all alerts (states value of 1 - warning or 2 - critical)
	 */
	getAlerts: function(){
	    var warnings = [], critical = [];
	    var host, service;

	    for(var h in this._states){
		var host = this._states[h];
		if(host.state === 1){
		    warnings.push({
			'host': host.name,
			'output': host.plugin_output,
			'last_check': host.last_check,
			'next_check': host.next_check,
			'last_ok': host.last_time_up,
			'service': host.service_description
		    });
		}else if(host.state === 2){
		    critical.push({
			'host': host.name,
			'output': host.plugin_output,
			'last_check': host.last_check,
			'next_check': host.next_check,
			'last_ok': host.last_time_up,
			'service': host.service_description
		    });
		}

		for(var s in host['services']){
		    service = host['services'][s];
		    if(service.state === 1){
			warnings.push({
			    'host': service.host_name,
			    'output': service.plugin_output,
			    'last_check': service.last_check,
			    'next_check': service.next_check,
			    'last_ok': service.last_time_ok,
			    'service': service.description
			});
		    }else if(service.state === 2){
			critical.push({
			    'host': service.host_name,
			    'output': service.plugin_output,
			    'last_check': service.last_check,
			    'next_check': service.next_check,
			    'last_ok': service.last_time_ok,
			    'service': service.description
			});
		    }
		}
	    }

	    return {'warnings': warnings, 'critical': critical};
	},

	/**
	 * Return the list of hosts and their related services
	 */
	getServicesList: function(){
	    var results = {}, host = false, service = false;
	    for(var h in this._states){
		host = this._states[h];
		results[host.name] = [];
		for(var s in host.services)
		    results[host.name].push(s);
	    }

	    return results;
	},


    };

    OnocStates._init();
    return OnocStates;
});
