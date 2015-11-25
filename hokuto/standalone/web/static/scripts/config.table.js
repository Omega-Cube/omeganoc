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
define(['jquery', 'onoc.createurl', 'console', 'jquery.hashchange'], function(jQuery, createurl, Console){
    "use strict";

    var _binarytree = [];
    var _data = false;
    var struct = false;
    var typeName = false;
    var isTemplate = false;
    //hooks
    var listcontent;
    var listtitle;
    var listdescription;
    
    var structure = {
        'host': {
            'id': 'host',
            'name': 'Host',
            'names': 'Hosts',
            'description': 'Defines a physical server, workstation, device, etc. that resides on your network',
            'key': 'host_name',
            'default_columns': ['host_name', 'address']
        },
        'hostgroup': {
            'id': 'hostgroup',
            'name': 'Host group',
            'names': 'Host groups',
            'description': 'Groups several hosts in a single entity',
            'key': 'hostgroup_name',
            'default_columns': ['hostgroup_name']
        },
        'service': {
            'id': 'service',
            'name': 'Service',
            'names': 'Services',
            'description': 'Identifies a "service" that runs on a host. The term "service" is used very loosely. It can mean an actual service that runs on the host (POP, SMTP, HTTP, etc.) or some other type of metric associated with the host (response to a ping, number of logged in users, free disk space, etc.).',
            'key': 'service_description',
            'default_columns': ['service_description', 'host_name', 'hostgroup_name']},
        'servicegroup': {
            'id': 'servicegroup',
            'name': 'Service group',
            'names': 'Service groups',
            'description': 'A service group definition is used to group one or more services together for simplifying configuration.',
            'key': 'servicegroup_name',
            'default_columns': ['service_description', 'host_name', 'hostgroup_name']},
        'contact': {
            'id': 'contact',
            'name': 'Contact',
            'names': 'Contacts',
            'description': 'Used to identify someone who should be contacted in the event of a problem on your network',
            'key': 'contact_name',
            'default_columns': ['contact_name', 'email']},
        'contactgroup': {
            'id': 'contactgroup',
            'name': 'Contact group',
            'names': 'Contact groups',
            'description': 'A contact group definition is used to group one or more contacts together for the purpose of sending out alert/recovery notifications',
            'key': 'contactgroup_name',
            'default_columns': ['contactgroup_name', 'members']},
        'timeperiod': {
            'id': 'timeperiod',
            'name': 'Time period',
            'names': 'Time periods',
            'description': 'A time period is a list of times during various days that are considered to be "valid" times for notifications and service checks. It consists of time ranges for each day of the week that "rotate" once the week has come to an end. Different types of exceptions to the normal weekly time are supported, including: specific weekdays, days of generic months, days of specific months, and calendar dates.',
            'key': 'timeperiod_name',
            'default_columns': ['timeperiod_name']},
        'command': {
            'id': 'command',
            'name': 'Command',
            'names': 'Commands',
            'description': 'Defines a console command executed when needed by another component',
            'key': 'command_name',
            'default_columns': ['command_name']},
        'hostdependency': {
            'id': 'hostdependency',
            'name': 'Host dependency',
            'names': 'Hosts dependencies',
            'description': 'Host dependencies are an advanced feature of Shinken that allow you to suppress notifications for hosts based on the status of one or more other hosts. Host dependencies are optional and are mainly targeted at advanced users who have complicated monitoring setups. ',
            'key': 'host_name',
            'default_columns': ['host_name']
        },
        'hostescalation': {
            'id': 'hostescalation',
            'name': 'Host escalation',
            'names': 'Hosts escalation',
            'description': 'Host escalations are completely optional and are used to escalate notifications for a particular host. ',
            'key': 'host_name',
            'default_columns': ['host_name']
        },
        'servicedependency': {
            'id': 'servicedependency',
            'name': 'Service dependency',
            'names': 'Servicies dependencies',
            'description': 'Service dependencies are an advanced feature of Shinken that allow you to suppress notifications and active checks of services based on the status of one or more other services. Service dependencies are optional and are mainly targeted at advanced users who have complicated monitoring setups. ',
            'key': 'service_description',
            'default_columns': ['service_description']
        },
        'serviceescalation': {
            'id': 'serviceescalation',
            'name': 'Service escalation',
            'names': 'Servicies escalation',
            'description': 'Service escalations are completely optional and are used to escalate notifications for a particular service.',
            'key': 'service_description',
            'default_columns': ['service_description']
        },
        'notificationway': {
            'id': 'notificationway',
            'name': 'Notificationway',
            'names': 'Notificationways',
            'description': 'A notificationway definition is used to define the way a contact is notified.',
            'key': 'notificationway_name',
            'default_columns': ['notificationway_name']
        },
        'realm': {
            'id': 'realm',
            'name': 'Realm',
            'names': 'Realms',
            'description': 'The realms are a optional feature useful if the administrator want to divide it’s resources like schedulers or pollers.',
            'key': 'realm_name',
            'default_columns': ['realm_name']
        },
        'arbiter': {
            'id': 'arbiter',
            'name': 'Arbiter',
            'names': 'Arbiters',
            'description': 'The Arbiter object is a way to define Arbiter daemons that will manage the configuration and all different architecture components of shinken (like distributed monitoring and high availability). It reads the configuration, cuts it into parts (N schedulers = N parts), and then sends them to all others elements. It manages the high availability part : if an element dies, it re-routes the configuration managed by this falling element to a spare one. Its other role is to receive input from users (like external commands of shinken.cmd) and send them to other elements. There can be only one active arbiter in the architecture.',
            'key': 'arbiter_name',
            'default_columns': ['arbiter_name']
        },
        'scheluder': {
            'id': 'scheluder',
            'name': 'Scheluder',
            'names': 'Scheluders',
            'description': 'The Scheduler daemon is in charge of the scheduling checks, the analysis of results and follow up actions (like if a service is down, ask for a host check). They do not launch checks or notifications. They keep a queue of pending checks and notifications for other elements of the architecture (like pollers or reactionners). There can be many schedulers.',
            'key': 'scheluder_name',
            'default_columns': ['scheluder_name']
        },
        'poller': {
            'id': 'poller',
            'name': 'Poller',
            'names': 'Pollers',
            'description': 'The Poller object is a way to the Arbiter daemons to talk with a scheduler and give it hosts to manage. They are in charge of launching plugins as requested by schedulers. When the check is finished they return the result to the schedulers. There can be many pollers.',
            'key': 'poller_name',
            'default_columns': ['poller_name']
        },
        'reactionner': {
            'id': 'reactionner',
            'name': 'Reactionner',
            'names': 'Reactionners',
            'description': 'The Reactionner daemon is in charge of notifications and launching event_handlers. There can be more than one Reactionner.',
            'key': 'reactionner_name',
            'default_columns': ['reactionner_name']
        },
        'broker': {
            'id': 'broker',
            'name': 'Broker',
            'names': 'Brokers',
            'description': 'The Broker daemon provides access to Shinken internal data. Its role is to get data from schedulers (like status and logs) and manage them. The management is done by modules. Many different modules exists : export to graphite, export to syslog, export into ndo database (MySQL and Oracle backend), service-perfdata export, couchdb export and more. To configure modules, consult the broker module definitions.',
            'key': 'broker_name',
            'default_columns': ['broker_name']
        }
    };

    function _applyCurrentHash() {
        _applyHash(window.location.hash.substr(1));
    }

    /**
     * Set the create button url to follow hash change
     **/
    function _applyCreateUrl(hash){
        document.getElementById('config_create').setAttribute('href',createurl('/config/'+hash+'/create'));
    }

    /**
     * Append a new node to the binarytree
     */
    function _appendBinary(element,key,binary){
        if(!binary[1]){
            binary = [false,element,false];
            return binary;
        }else if(element[key] <= binary[1][key]){
            binary[0] = _appendBinary(element,key,binary[0]);
        }else{
            binary[2] = _appendBinary(element,key,binary[2]);
        }
        return binary;
    }

    /**
     * Parse the binarytree and return sorted array
     */
    function _parse(tmp,binary){
        if(binary[0]) tmp = _parse(tmp,binary[0]);
        if(binary[1]) tmp.push(binary[1]);
        if(binary[2]) tmp = _parse(tmp,binary[2]);
        return tmp;
    }

    /**
     * Search for a pattern from keys (WIP: unused now but is ready for the incoming search toolbar)
     */
    function _search(search,tmp,key,binary){
        if(binary[0]) _search(search,tmp,key,binary[0]);
        if(binary[1][key].search(search) != -1) tmp.push(binary[1]);
        if(binary[2]) _search(search,tmp,key,binary[2]);
        return tmp;
    }

    /**
     * Build the binarytree and return sorted array
     */
    function _sort(list,key){
        _binarytree = [];
        var tmp = [];
        for(var i = 0; i<list.length;i++){
            _binarytree = _appendBinary(list[i],key,_binarytree);
        }
        tmp = _parse(tmp,_binarytree);
        return tmp;
    }

    function _fillTable(results){
        listcontent.empty();
        for(var i in results){
            var li = $('<li></li>');
            for(var k in struct.default_columns){
                li.append('<span class="cell">'+results[i][struct.default_columns[k]]+'</span>');
            }

            //add actions
            var urlparams = typeName + (isTemplate ? 'template/' : '/') + (isTemplate ? results[i]['name'] : results[i][struct.key]);
            var urladv = createurl('/config/expert/'+ urlparams);
            var urldel = createurl('/config/delete/' + urlparams);
            var url = createurl('/config/' + urlparams);
            //if service the url is different (???)
            if(typeName == 'service') {
                var url_end = '';
                if('host_name' in results[i] && results[i].host_name)
                    url_end += '$' + results[i].host_name;
                if('hostgroup_name' in results[i] && results[i].hostgroup_name)
                    url_end += '+' + results[i].hostgroup_name;
                if(url_end)
                    url += '/' + url_end;

                url = createurl(url);
            }

            if(!ONOC.conf_is_locked){
                var span = jQuery('<span></span>');
                span.append('<a href="'+url+'" class="button">Edit</a>');
                span.append('<a href="'+urladv+'" class="button" data-tooltip="For experts only, edit config file directly.">Advanced</a>');
                li.append(span);
                li.append('<span class="cell"><a href="'+urldel+'" class="button remove">Remove</a></span>');
            }else{
                li.append('<span class="cell"><a href="'+url+'" class="button">View</a></span>');
            }
            listcontent.append(li);
        }
    }
    
    function _applyHash(hash) {
        if(!hash){
            Console.warn('Could not apply an empty hash !');
            return;
        }

        //flush
        listcontent.empty();
        listtitle.empty();
        jQuery(".configlist-title .search").val('');

        // Remove the trailing s if it's there
        if(hash.charAt(hash.length - 1) == 's')
            hash = hash.substr(0, hash.length - 1);

        typeName = hash;
        isTemplate = false;

        // If that a template ?
        if(typeName.match('template')) {
            // Yup
            isTemplate = true;
            typeName = typeName.substr(0, typeName.length - 8);
        }

        //get typestructure
        struct = structure[typeName];

        //setup create button
        _applyCreateUrl(hash);

        //fetch data and fill list
        var serviceUrl = createurl('/config/list/' + struct.id + (isTemplate ? 'templates' : 's'));
        jQuery.get(serviceUrl).success(function(response){
            if(response.success){
                _data = _sort(response.data,struct.key);

                //setup title
                var title = (_data.length > 1) ? struct.names : struct.name;
                if(isTemplate) title += ' ' + 'template';
                title += ' ('+_data.length+')';
                listtitle.text(title);
                listdescription.text(struct.description);

                //TODO: add pagination and search bar
                

                //fill list
                if(_data.length){
                    _fillTable(_data);
                }else{
                    var li = $('<li class="empty">There is currently no '+(typeName + ((isTemplate) ? ' template ':''))+' defined!</li>');
                    listcontent.append(li);
                }
            }
        }).error(function(e,f){
            console.error(e,f);
        });
    };
    jQuery(function(){
        //actions
        jQuery("#conf-apply-changes").click(function(e){
            jQuery.ajax('/config/apply',{
                'method': 'POST',
            }).success(function(response){
                console.log(response);
                if(!response.success){
                    alert(response.error);
                }else{
                    alert("Shinken will restart with the new configuration in less than one minute.");
                }
            }).error(function(response){
                console.log(response);
            });
        });
        jQuery("#conf-reset-changes").click(function(e){
            jQuery.ajax('/config/reset',{
                'method': 'DELETE',
            }).success(function(response){
                document.location.reload();
            }).error(function(response){
                console.log(response);
            });
        });
        jQuery("#conf-lock").click(function(e){
            jQuery.ajax('/config/lock').success(function(response){ document.location.reload(); }).error(function(e){console.log(e)});
        });
        jQuery(".configlist-title .search").on("input",function(e){
            var key = e.target.value;
            var results = _search(key,[],struct.key,_binarytree);
            _fillTable(results);
        });

        //hooks
        listcontent = jQuery('.configlist .configlist-content');
        listtitle = jQuery('.configlist .configlist-title .title-total');
        listdescription = jQuery('.configlist .configlist-title .description');
        
        //navigation
        jQuery(window).hashchange(function() {
            _applyCurrentHash();
        });
        if(!window.location.hash) {
            // If no url hash provided, go to the hosts by default
            _applyHash('hosts');
        } else {
            _applyCurrentHash();
        }
    });
});
