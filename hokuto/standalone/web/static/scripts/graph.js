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

define([
    'jquery', 
    'graph.structure', 
    'graph.renderer', 
    'graph.infopanel', 
    'graph.state', 
    'console', 
    'onoc.structuretree', 
    'onoc.states', 
    'onoc.createurl', 
    'onoc.popupbutton', 
    'libs/jquery.hashchange', 
    'onoc.message'
], function(jQuery, 
            structure, 
            Bubbles, 
            initInfoPanel, 
            GraphState, 
            Console, 
            StructureTree, 
            States, 
            createurl, 
            popupButton) {
    var OVERVIEW_KEY = 'overview_visibility';
    var Grapher = {
        // Holds the currently displayed graph type identifier
        _currentType: '',

        // Holds the currently used instance of the renderer, the class responsible for drawing the graph on screen
        _renderer: null,

        // Saves the coordinates of a single node.
        // The second parameter (graph type identifier) is optionnal. Its default value
        // is the currently displayed graph type
        saveOneNodeCoordinates: function (node, graphType) {
            graphType = graphType || (Grapher._currentType);
            var data = {};
            data[node.id + ':x'] = node.x;
            data[node.id + ':y'] = node.y;

            GraphState.save(graphType, data);
        },
        
        saveAllGraphAs: function(name) {
            if(Grapher._renderer) {
                // Make sure that all the nodes have correct positions
                Grapher._renderer.updateAllNodesPositions();
                
                var fullName = Grapher._currentType + '$' + name;
                
                var data = {};
                var graph = Grapher._renderer.graph;
                // Save nodes
                for(var i in graph.nodes) {
                    var n = graph.nodes[i];
                    data[n.id + ':x'] = n.x;
                    data[n.id + ':y'] = n.y;
                }
                
                // Save links
                for(var j in graph.edges) {
                    var e = graph.edges[j];
                    // Only save user created nodes
                    if(e.shinken_type === 'user_created') {
                        data['link:' + e.source.id + ':' + e.target.id] = 'virtual';
                    }
                }
                
                GraphState.save(fullName, data);
                
                Grapher.flashGlobalMessage('Saving...');
            }
        },
        
        deleteSave: function(name) {
            GraphState.save(Grapher._currentType + '$' + name, {}, true);
            Grapher.flashGlobalMessage('Save deleted !');
        },

        saveMetadata: function(key, value) {
            var data = {};
            data['hokuto__meta:' + key] = value;
            GraphState.save(Grapher._currentType, data);
        },
        
        _loadGraph: function(graphTypeName, successCallback) {
            Console.log('loading state ' + graphTypeName);
            GraphState.load(graphTypeName, function (result) {
                successCallback(result);
            }, function () {
                Console.warn('No existing layout could be loaded for the graph (' + graphTypeName + ')');
                Grapher.showGlobalMessage('Graph data could not be loaded.');
            });
        },

        // Loads the graph data matching the specified graph name,
        // and displays it
        
        loadAndShowGraph: function (graphName, layoutName) {
            Console.log('loading with layout: ' + layoutName);
            // Load the corresponding javascript file and start processing
            var parts = Grapher._parseGraphNameParts(graphName);
            require(['graph.type.' + parts.name], function (typeObject) {
                Grapher._currentType = graphName;

                // Load the graph data from the server
                var loadName = Grapher._currentType;
                if(layoutName)
                    loadName += '$' + layoutName;
                
                Grapher._loadGraph(loadName, function (graph) {
                    // Once the graph is ready, display it
                    if (Object.keys(graph).length === 0) {
                        // Returned graph is empty !
                        Grapher.showGlobalMessage('This graph is empty !');
                    }
                    else {
                        graph = structure(graph);
                        var graphTypeInstance = new typeObject(graph, graphName);
                        Grapher.showGlobalMessage('');
                        var firstDisplay = true;
                        if (Grapher._renderer) {
                            Grapher._renderer.show();
                            Grapher._renderer.setGraphData(graph, graphTypeInstance);
                            Grapher.updateStatus();
                            firstDisplay = false;
                        }
                        else {
                            var container = document.getElementById('onoc-graph');
                            Grapher._renderer = new Bubbles(document.getElementById('onoc-graph'), graph, graphTypeInstance);

                            // Set initial states for the nodes
                            Grapher.updateStatus();

                            //subscribe States events.
                            States.subscribe(function () {
                                Grapher.updateStatus();
                            });

                            // When the user double-clicks on a node, select all the child nodes !
                            jQuery(container).on('activate', function (e, node) {
                                var nodes = [];
                                for (var i = 0, c = node.link_out.length; i < c; ++i)
                                    nodes.push(node.link_out[i].target);
                                Grapher._renderer.selectNodes(nodes);
                            });
                            
                            // When the overview visibility changes, save it to have the same later
                            jQuery(container).on('overview_toggle.onoc', function() {
                                // Save the new overview state
                                Grapher.saveMetadata('overview_visibility', Grapher._renderer.getOverviewVisibility() ? 'visible' : 'collapsed');
                            });
                            
                        }

                        if(OVERVIEW_KEY in graph.meta) {
                            Grapher._renderer.setOverviewVisibility(graph.meta[OVERVIEW_KEY] === 'collapsed' ? false : true, !firstDisplay);
                        }
                        
                        _updateMenu(graphName);
                    }
                });

            }, function (err) {
                Grapher.showGlobalMessage('Could not load this graph. Check that you are using a valid URL');
                Console.error('Graph loading error: ' + err);
            });
        },

        // Asks the server to re-generate the graph layout and displays
        // the new layout
        resetGraph: function (layout) {
            if (!Grapher._currentType)
                // No graph loaded. No can reset !
                return;

            // Add text which tells the user that the layout is reseting
            //Grapher.showGlobalMessage('Generating a new layout...');

            jQuery.ajax({
                dataType: 'json',
                url: '/reset_graph',
                data: {'graph': Grapher._currentType, 'layout': layout},
                success: function () {
                    // Load and save the graph
                    Grapher.loadAndShowGraph(Grapher._currentType);
                },
                error: function (jqXhr, textStatus, errorThrown) {
                    Grapher.showGlobalMessage('An error occured while we were generating the graph :(');
                    Console.warn('XHR error calling /reset_graph: ' + textStatus + '(' + errorThrown + ')');
                }
            });
        },

        showGlobalMessage: function (text) {
            if (Grapher._renderer) {
                Grapher._renderer.hide();
            }

            jQuery('#graph-big-msg').data('onocMessage').setText(text);
        },
        
        flashGlobalMessage: function(text) {
            jQuery('#graph-big-msg').data('onocMessage').setText(text);
            jQuery('#graph-big-msg').data('onocMessage').setText('');
        },

        applyCurrentHash: function () {
            // Get the link and the string after the hash (if there is any)
            var hashLink = window.location.hash;

            Grapher.loadAndShowGraph(hashLink.substr(1));
        },

        _parseGraphNameParts: function (hashValue) {
            var parts = hashValue.split('/');
            var args = [];
            if (parts.length > 1) {
                args = parts[1].split(/ *; */).map(function (currentValue) {
                    return currentValue.split(/ *, */);
                });
            }
            return { 'name': parts[0], 'args': args };
        },

        updateStatus: function () {
            // Check if there is already some data into the States manager
            if (States.getStates().length === 0)
                return;

            // Update the state of the nodes

            for (var name in Grapher._renderer.graph.nodes) {
                var node = Grapher._renderer.graph.nodes[name];
                if (node.shinken_type === 'host') {
                    var curState = States.getHostState(node.id);
                    if (!node.state || node.state.state !== curState.state) {
                        // The host changed state
                        Grapher._renderer.updateNodeState(node, curState);
                    }
                }
                else if (node.shinken_type === 'service') {
                    var nameParts = node.id.split('$');
                    var curSvcState = States.getServicesStates(nameParts[0], nameParts[1]);
                    if (!node.state || node.state.state !== curSvcState.state) {
                        // The service changed state
                        Grapher._renderer.updateNodeState(node, curSvcState);
                    }
                }
                else {
                    Console.log('[Bubbles Renderer] Unknown shinken type "' + node.shinken_type + '" for node "' + name + '"');
                }
            }

            for (var groupName in Grapher._renderer.graph.groups) {
                var group = Grapher._renderer.graph.groups[groupName];
                // All groups are hosts
                var curHostState = States.getHostState(group.id);
                if (!group.state || group.state.state !== curHostState.state)
                    Grapher._renderer.updateGroupState(group, curHostState);
            }
        },
    };

    jQuery(document).ready(function () {
        popupButton();
        _fillLayoutMenu();
        _fillLoadSaveMenu();
    
        // Initialize the global message display
        jQuery('#graph-big-msg').onocMessage();

        Grapher.showGlobalMessage('Loading...');

        jQuery(window).hashchange(function () {
            Grapher.applyCurrentHash();
        });

        // Get the link and the string after the hash (if there is any)
        var hashLink = window.location.hash;

        if (hashLink === '') {
            window.location.hash = '#physical.hosts';
            // The graph will be loaded by the hash changed event, triggered by this previous line
        }
        else {
            // Load this graph
            Grapher.applyCurrentHash();
        }

        new StructureTree(document.getElementById('treeview-container'), 80);

        initInfoPanel(document.querySelector('.column-content.props'));
    });
    
    function _fillLayoutMenu() {
        var container = jQuery('ul[data-layout-list]');
        _createLayoutMenuEntry(container, 'Circular', 'circular');
        _createLayoutMenuEntry(container, 'Hierarchical uncentered', 'sugiyama');
        _createLayoutMenuEntry(container, 'Hierarchical centered', 'reingold-tilford');
        _createLayoutMenuEntry(container, 'Spring', 'spring');
        _createLayoutMenuEntry(container, 'Horizontal groups', 'grouping');
        _createLayoutMenuEntry(container, 'Circular tree', 'circular-tree');
        _createLayoutMenuEntry(container, 'Clustered', 'sfdp');
    }

    function _createLayoutMenuEntry(container, displayName, layoutName) {
        // Create the <a> element
        var link = jQuery('<a href="#" data-layout="' + layoutName + '">' + displayName + '</a>');
        link.click(function (e) {
            e.preventDefault();

            Grapher.resetGraph(jQuery(this).data('layout'));
        });

        // Add the link to the menu
        link = link.wrap('<li></li>').parent();
        container.append(link);
    }

    var _menuGraphType = '';
    
    function _fillLoadSaveMenu() {
        // Setup the new save textbox
        var newBox = jQuery('#newSaveName');
        newBox.keyup(function (e) {
            e.preventDefault();

            if (e.which === 13 && newBox.val().length > 0) { // If enter key (13) was pressed
                if(newBox.data('valid')) {
                    var newName = newBox.val();
                    Grapher.saveAllGraphAs(newName);
                    _createLoadSaveMenuEntry(newName);
                    newBox.val('');
                    _updateNoSaveDisplay();
                }
            }
            else if (e.which === 27) { // If escape key (27) was pressed
                newBox.val('');
            }
            else {
                // Validate
                // TODO : Check that the name does not already exist
                if(newBox.val().search(/^[a-zA-Z0-9_\. \-]+$/i) === -1) {
                    // Invalid
                    if(newBox.val().length === 0) {
                        jQuery('#newSaveName-validation').text('Enter a name').show();
                    }
                    else {
                        jQuery('#newSaveName-validation').text('No special characters allowed').show();
                    }
                    newBox.data('valid', false);
                }
                else {
                    // Valid
                    jQuery('#newSaveName-validation').hide();
                    newBox.data('valid', true);
                }
            }
        });
        
        newBox.blur(function() {
            newBox.val('');
            jQuery('#newSaveName-validation').hide();
            newBox.data('valid', false);
        });
    }
    
    function _createLoadSaveMenuEntry(name) {
        // Load entry
        var link = jQuery('<a href="#"></a>').text(name).data('loadname', name).click(function(e) {
            Grapher.loadAndShowGraph(Grapher._currentType, jQuery(this).data('loadname'));
            e.preventDefault();
        });
        var removeIcon = jQuery('<img src="' + createurl('static/images/picture_delete.png') + '" alt="Delete" title="Delete this save" class="remove-icon" />');
        removeIcon.click(function(e) {
            e.preventDefault();
            e.stopPropagation(); // Do not propagate to the container link
            var jqThis = jQuery(this);
            var loadName = jqThis.parent().data('loadname');
            
            if(confirm('Do you want to remove the save named "' + loadName + '" ?')) {
                // Remove !
                Grapher.deleteSave(loadName);
                // Remove the menu entries
                jqThis.parent().parent().remove();
                jQuery('li.save-entry').each(function() {
                    var jqSaveLink = jQuery(this);
                    if(jqSaveLink.find('a').data('savename') === loadName) {
                        jqSaveLink.remove();
                        return false;
                    }
                });
                
                _updateNoSaveDisplay();
            }
        });
        link.append(removeIcon);
        link = link.wrap('<li class="load-entry"></li>').parent();
        jQuery('#loadmenu').append(link);
        
        // Save entry
        link = jQuery('<a href="#"></a>').text(name).data('savename', name).click(function(e) {
            Grapher.saveAllGraphAs(jQuery(this).data('savename'));
            e.preventDefault();
        });
        link = link.wrap('<li class="save-entry"></li>').parent();
        jQuery('#savemenu').append(link);
    }
    
    function _clearLoadSaveMenu() {
        jQuery('li.load-entry').remove();
        jQuery('li.save-entry').remove();
    }
    
    function _updateMenu(graphname) {
        var graphtype = graphname;
        var sep = graphtype.indexOf('$');
        if(sep > -1) {
            graphtype = graphtype.substr(0, sep);
        }
        
        if(graphtype !== _menuGraphType) {
            _menuGraphType = graphtype;
            jQuery.getJSON(createurl('/graph/saves/' + graphtype), function(data) {
                _clearLoadSaveMenu();
                
                for(var i = 0, c = data.length; i < c; ++i) {
                    _createLoadSaveMenuEntry(data[i]);
                }
                
                _updateNoSaveDisplay();
            });
        }
    }
    
    // Checks if saves actually exists, and shows / hides UI elementsthat says that no save exists
    function _updateNoSaveDisplay() {
        if(jQuery('li.load-entry').length > 0) {
            jQuery('li.no-load-entry').hide();
            Console.log('hide');
        }
        else {
            jQuery('li.no-load-entry').show();
            Console.log('show');
        }
    }
    
    return Grapher;
});
