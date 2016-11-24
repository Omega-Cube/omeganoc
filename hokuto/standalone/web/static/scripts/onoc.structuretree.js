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
define([
    'jquery', 
    'onoc.createurl', 
    'onoc.loadcss', 
    'scrollbar', 
    'dataservice', 
    'console', 
    'libs/jstree'], function (jQuery, createUrl, loadCss, createScrollbar, DataService, Console) {
    function StructureTree(container, heightCompensation) {
        var jqContainer = jQuery(container);
        loadCss(createUrl('static/css/jstree.min.css'));
        loadCss(createUrl('static/css/tree.css'));

        var searchTimeoutHandle = null;

        // Data loading tools
        var currentDataHolders = null; // Contains the current tree data

        function _load(parent, callback) {
            if(!currentDataHolders) {
                // We should load that data first...
                _loadDataHolders(function() {
                    _loadNode(callback);
                }, function() {
                    alert('error');
                });
            }
            else {
                _loadNode(callback);
            }
        }

        function _loadNode(callback) {
            var result = [];
            var orphanHosts = [];
            var i, c;

            // Load host groups
            for (var hname in currentDataHolders.hosts) {
                var h = currentDataHolders.hosts[hname];

                if (h.groups && h.groups.length) {
                    for (i = 0, c = h.groups.length; i < c; ++i) {
                        var hgroupname = h.groups[i];
                        var d = result.length;
                        if (d === 0) {
                            result.push(_createHostGroupNode(hgroupname, hgroupname));
                        }
                        else {
                            // Here we insert all hostgroups in a list, avoiding duplicates and sorting them by name
                            var hgroupnode = null;
                            for (var j = 0; j < d; ++j) {
                                var rname = result[j].id;
                                if (rname === hgroupname) {
                                    // Group already in list
                                    hgroupnode = result[j];
                                    break;
                                }
                                else if (hgroupname < rname) {
                                    hgroupnode = _createHostGroupNode(hgroupname, hgroupname);
                                    result.splice(j, 0, hgroupnode);
                                    break;
                                }
                                else if (j === d - 1) {
                                    hgroupnode = _createHostGroupNode(hgroupname, hgroupname);
                                    result.push(hgroupnode);
                                    break;
                                }
                            }

                            // Insert the host inside the hostgroup
                            var hnode = _loadHostNode(h, hgroupnode.id);
                            hgroupnode.children.push(hnode);
                        }
                    }
                }
                else {
                    // This host has no groups
                    orphanHosts.push(h);
                }
            }

            // Add the special 'Orphans' group that will contain the hosts that have no group
            if (orphanHosts.length > 0) {
                var orphanNode = _createHostGroupNode('__orphans', 'Orphans');
                result.push(orphanNode);

                for (i = 0, c = orphanHosts.length; i < c; ++i) {
                    orphanNode.children.push(_loadHostNode(orphanHosts[i], orphanNode.id));
                }
            }

            callback.call(this, result);
        }

        function _loadHostNode(host, containerId) {
            var node = _createHostNode(containerId + '_' + host.name, host.name);

            // Add the host's services, sorted alphabetically
            var sortedServices = host.services.sort();

            for (var i = 0, c = sortedServices.length; i < c; ++i) {
                var sname = sortedServices[i];
                node.children.push(_createServiceNode(node.id + '_' + sname, sname, host.name + '$' + sname));
            }

            return node;
        }

        function _createHostGroupNode(id, name) {
            return {
                'id': id,
                'text': name,
                'state': {
                    'opened': false
                },
                'children': [],
                'isa': 'hostgroup',
            };
        }

        function _createHostNode(id, name) {
            return {
                'id': id,
                'text': name,
                'icon': hostIconUrl,
                'children': [],
                'isa': 'host',
            };
        }

        function _createServiceNode(id, name, serviceId) {
            return {
                'id': id,
                'text': name,
                'icon': serviceIconUrl,
                'children': [],
                'isa': 'service',
                'serviceId': serviceId,
            };
        }

        function _loadDataHolders(successCallback, errorCallback) {
            currentDataHolders = {};

            DataService.getHostsList(function(hosts) {
                currentDataHolders.hosts = hosts;

                DataService.getServicesList(function(services) {
                    currentDataHolders.services = services;
                    successCallback();
                }, function() {
                    Console.error('Could not load the services list');
                    errorCallback();
                });
            }, function() {
                Console.error('Could not load the hosts list');
                errorCallback();
            });
        }


        // Prepare the container structure for the scrollbar
        jqContainer.append('<div class="tree-toolbar"><button class="collapse" title="Collapse all">Collapse all</button><input type="text" class="searchbox" placeholder="Search" /></div><div class="scrollbar"><div class="track"><div class="thumb"><div class="end"></div></div></div></div><div class="viewport"><div class="overview"></div></div>');
        jqContainer.attr('data-scrollbar', '0');
        var overview = jqContainer.find('.overview');

        var hostIconUrl = createUrl('static/images/elements/server.png');
        var serviceIconUrl = createUrl('static/images/elements/brick.png');

        overview.jstree({
            'core': {
                'data': _load
            },
            'plugins': ['search'],
            'search': {
                'fuzzy': false,
                'show_only_matches': true,
            }
        });

        var mytree = overview.jstree(true);

        overview.on('after_open.jstree after_close.jstree', function (e) {
            e.stopPropagation();

            overview.trigger('updatescrollbar.onoc');
        });

        // Start the scrollbar
        createScrollbar(jqContainer, heightCompensation);

        // Configure the toolbar
        jqContainer.find('.tree-toolbar > .collapse').click(function () {
            mytree.close_all(null, 300);
        });

        function onSearchTimeoutReached() {
            searchTimeoutHandle = null;

            var val = jQuery('.tree-toolbar > .searchbox').val();
            if (val.length < 1) // Searches with just 1 char are too slow, drop them
                val = '';
            mytree.search(val);
        }

        jqContainer.find('.tree-toolbar > .searchbox').keyup(function () {
            if (searchTimeoutHandle)
                clearTimeout(searchTimeoutHandle);
            
            searchTimeoutHandle = setTimeout(onSearchTimeoutReached, 500);
        });

        overview.on('changed.jstree', function (event, data) {
            // Isolate the selected IDs
            var selection = [];
            for (var i = 0, c = data.selected.length; i < c; ++i) {
                var node = mytree.get_node(data.selected[i]);
                if (selection.indexOf(node.text) === -1) {
                    if (node.original.isa === 'service')
                        selection.push(node.original.serviceId);
                    else if(node.original.isa === 'host')
                        selection.push(node.text);
                }
            }
            // Notify other components
            jQuery(document).trigger('select_element.onoc', { 'selection': selection, 'source': 'treeview' });
        });
    }

    return StructureTree;
});
