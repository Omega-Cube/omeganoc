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
define(['jquery', 'onoc.createurl', 'onoc.states', 'dataservice', 'console'], function (jQuery, createUrl, states, DataService, Console) {
    var _currentPanel = false; // Tells us if there's a panel currently displayed. When not false contains the name of the displayed element
    var _container = null; // The jQuery object containing the container

    // Create a property table containing the names and values of the provided dictionary
    // It will create something like :
    // <div class="table">
    // <p><span>key 1</span><span>value 1</span></p>
    // <p><span>key 2</span><span>value 2</span></p>
    // </div>
    function createPropertyTable(properties) {
        var result = jQuery('<div class="table"></div>');

        for (var name in properties) {
            var value = properties[name];
            var t = jQuery('<span></span>').text(name + ': ');
            t = jQuery('<p></p>').append(t);
            if (jQuery.isPlainObject(value)) {
                var newSpan = jQuery('<span></span>');
                if (value.class)
                    newSpan.attr('class', value.class);
                if (value.noEscaping)
                    newSpan.append(value.value);
                else
                    newSpan.text(value.value);
                t.append(newSpan);
            }
            else {
                t.append(jQuery('<span></span>').text(value));
            }
            result.append(t);
        }

        return result;
    }

    function createNotesSection(data) {
        var notes = null;
        if (data.notes || data.notes_url) {
            notes = jQuery('<div class="prop-notes"></div>');
            if (data.notes_url)
                notes.append(jQuery('<a title="Go to the notes page" target="_blank">Notes</a>').attr({ 'href': data.notes_url }).wrap('<p></p>'));
            else
                notes.append('<p>Notes</p>');

            if (data.notes)
                notes.append(jQuery('<p></p>').text(data.notes));
        }

        return notes;
    }

    function createRedStars(activeCount) {
        // Unicode chars used :
        // - ★ Black Star &#9733;
        // - ☆ Star &#9734;

        var text = '';
        for(var i = 0; i < 5; ++i) {
            if (i < activeCount)
                text += '&#9733;';
            else
                text += '&#9734;';
        }

        return jQuery('<span class="stars-red" title="' + activeCount + '">' + text + '</span>');
    }

    function removeCurrentPanel() {
        _container.find('> div').remove();
        _currentPanel = false;
    }

    function createHostPanel(hostName, successCallback, errorCallback) {

        // Get the host data first
        DataService.getHost(hostName, function (host) {
            if (!host) {
                Console.error('createHostPanel did not find a host called ' + hostName + ' !');
                errorCallback();
                return;
            }
            var panel = jQuery('<div class="host"></div>');
            var title = jQuery('<h4></h4>').text(hostName);
            panel.append(title);

            if(host.alias)
                panel.append(jQuery('<h5></h5>').text(host.alias));

            var notes = createNotesSection(host);
            if (notes)
                panel.append(notes);
            
            /*
                Note: for hosts, Livestatus states are:
                0 - UP
                1 - DOWN
                2 - UNREACHABLE
            */
            
            var statusText = 'Unknown', statusClass = 'status-unknown';
            switch(states.getHostState(hostName).state) {
            case 0:
                statusText = 'Up';
                statusClass = 'status-ok';
                break;
                
            case 1:
                statusText = 'Down';
                statusClass = 'status-ko';
                break;
                
            case 2:
                statusText = 'Unreachable';
                statusClass = 'status-unknown';
                break;
            }
            
            panel.append(createPropertyTable({
                'Status': {
                    'value': statusText,
                    'class': statusClass,
                },
                'Services': host.num_services,
                'Address': host.address,
                'Business impact': { 
                    'value': createRedStars(host.business_impact),
                    'noEscaping': true },
                'Check period': host.check_period,
                'Check interval': host.check_interval + ' min',
                'Contacts': host.contacts.join(', '),
                'Last time up': host.last_time_up === 0 ? 'Unknown' : (new Date(host.last_time_up * 1000)).toLocaleString(),
            }));

            successCallback(panel);
        }, function () {
            errorCallback();
        });
    }

    function createServicePanel(hostName, serviceName, successCallback, errorCallback) {
        // Get the service data first
        DataService.getService(hostName, serviceName, function (service) {
            if (!service) {
                Console.error('createServicePanel did not find a service called ' + hostName + ' !');
                errorCallback();
                return;
            }
            var panel = jQuery('<div class="service"></div>');
            var title = jQuery('<h4></h4>').text(serviceName);
            panel.append(title);

            if (service.host_alias)
                panel.append(jQuery('<h5></h5>').text('into ' + service.host_name + ' (' + service.host_alias + ')'));
            else
                panel.append(jQuery('<h5></h5>').text('into ' + service.host_name));

            var notes = createNotesSection(service);
            if (notes)
                panel.append(notes);

            /*
                Note: for services, Livestatus states are:
                0 - OK
                1 - WARN
                2 - CRIT
                3 - UNKNOWN
            */

            var statusText = 'Unknown', statusClass = 'state-unknown';
            switch(states.getServicesStates(hostName, serviceName).state) {
            case 0:
                statusText = 'Ok',
                statusClass = 'status-ok';
                break;
                
            case 1:
                statusText = 'Warning';
                statusClass = 'status-warning';
                break;
                
            case 2:
                statusText = 'Critical';
                statusClass = 'status-ko';
                break;
            
            case 3:
                statusText = 'Unknown';
                statusClass = 'status-unknown';
                break;
            }

            panel.append(createPropertyTable({
                'Status': {
                    'value': statusText,
                    'class': statusClass,
                },
                'Business impact': {
                    'value': createRedStars(service.business_impact),
                    'noEscaping': true
                },
                'Check period': service.check_period,
                'Check interval': service.check_interval + ' min',
                'Contacts': service.contacts.join(', '),
                'Last time OK': service.last_time_ok === 0 ? 'Unknown' : (new Date(service.last_time_ok * 1000)).toLocaleString(),
            }));

            successCallback(panel);
        }, function () {
            errorCallback();
        });
    }

    function errorCallback() {
        alert('error !');
    }

    function initPanel(container) {
        _container = jQuery(container);

        jQuery(document).on('select_element.onoc', function (e, data) {
            if (data.selection.length > 0) {
                // We'll display only the first selected item for now
                var name = data.selection[0];

                if (name !== _currentPanel) {
                    removeCurrentPanel();

                    // Service or host ?
                    if (name.indexOf('$') >= 0) {
                        // Service
                        name = name.split('$');
                        createServicePanel(name[0], name[1], function (result) {
                            _container.append(result);
                            _currentPanel = name;
                        });
                    }
                    else {
                        // Host
                        createHostPanel(name, function (result) {
                            _container.append(result);
                            _currentPanel = name;
                        }, errorCallback);
                    }
                }
            }
            else if(_currentPanel) {
                removeCurrentPanel();
            }
        });
    }

    return initPanel;
});
