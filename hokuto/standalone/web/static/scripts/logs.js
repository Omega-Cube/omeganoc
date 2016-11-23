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
require(['jquery','onoc.createurl', 'onoc.states'],function(jQuery, createUrl, OnocStates){
    jQuery(document).ready(function(){
        var hosts = false;

        function _init(hosts){
            var container = document['logs-switch-1-select'].target;
            var option = false;
            for(var h in hosts){
                option = document.createElement('option');
                option.setAttribute('value',h);
                option.text = h;
                container.appendChild(option);
                for(var s in hosts[h]){
                    option = document.createElement('option');
                    option.setAttribute('value',h.concat('.',hosts[h][s]));
                    option.text = h.concat('.',hosts[h][s]);
                    container.appendChild(option);
                }
            }
            container.addEventListener('change',function(e){
                var target = e.target.value;
                var container = jQuery('#logs-switch-1 .logs_list');
                container.empty();
                buildLogList(target,container);
            });
        }

        function buildLogList(target,container){
            target = String.split(target,'.');
            var host = target[0];
            var service = (target[1]) ? target[1]:false;
            var url = (service) ? createUrl('/services/livestatus/get/service/logs/'+host+'/'+service+'/') :
                createUrl('/services/livestatus/get/host/logs/'+host+'/');
            var columns = ['time','host_name','service_description','plugin_output','state'].join(','); 
            jQuery.ajax({
                'url': url + columns,
                'type': 'GET'
            }).success(function(response){
                var results = response.results;
                var log = false, entry = false, date = false;
                for(var l in results){
                    log = results[l];
                    date = new Date(log.time * 1000);
                    entry = jQuery('<li></li>');
                    entry.append('<span class="date">'+(date.toLocaleDateString() +', '+date.toLocaleTimeString())+'</span>');
                    entry.append('<span class="output">'+log['plugin_output']+'</span>');
                    container.append(entry);
                }
            });
        }

        jQuery(document).on('onoc.livestatus.states',function(){
            if(!hosts){
                hosts = OnocStates.getServicesList();
                _init(hosts);
            }
        });
    });
});
