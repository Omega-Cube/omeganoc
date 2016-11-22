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

// The physical graph type displays hostgroups and hosts, organized by physical dependencies

define(['graph.type.base', 'graph.state'], function (base, GraphState) {
    var LogicalHost = function (graph, fullName) {
        var selfRef = this;
        this.name = fullName;
        this.graph = graph;

        this.getCommandsForNode = function (node) {
            return [{
                image: 'link-to.png',
                label: 'Create a new link from this node',
                mousedown: function (clickedNode, renderer) {
                    renderer.hideCommands();
                    renderer.startCreateUserLink(clickedNode, function (otherNode) {
                        // The user designated a target node
                        // Check that the link does not already exist
                        var i = 0;
                        var c = otherNode.link_in.length;
                        for (; i < c; ++i) {
                            if (otherNode.link_in[i].target.id === clickedNode.id) {
                                return false;
                            }
                        }
                        c = clickedNode.link_out.length;
                        for (i = 0; i < c; ++i) {
                            if (clickedNode.link_out[i].source.id === otherNode.id) {
                                return false;
                            }
                        }

                        // Create the link on the server
                        var tokenName = 'link:' + clickedNode.id + ':' + otherNode.id;
                        var tokenValue = 'virtual'; // Not much stuff to put in there yet...
                        var data = {};
                        data[tokenName] = tokenValue;

                        GraphState.save(selfRef.name, data);

                        // Create the edge
                        var edge = {
                            'source': clickedNode,
                            'target': otherNode,
                            'shinken_type': 'user_created'
                        };

                        // Put the edge into the graph data
                        selfRef.graph.edges.push(edge);
                        clickedNode.link_out.push(edge);
                        otherNode.link_in.push(edge);

                        return edge;
                    }, function (otherNode) {
                        // Accept the link only if it's not already there
                        var i = 0;
                        var c = otherNode.link_in.length;
                        for (; i < c; ++i) {
                            if (otherNode.link_in[i].source.id === clickedNode.id) {
                                return false;
                            }
                        }
                        c = otherNode.link_out.length;
                        for (i = 0; i < c; ++i) {
                            if (otherNode.link_out[i].target.id === clickedNode.id) {
                                return false;
                            }
                        }
                        return true;
                    }, function () {
                        // The user aborted the operation
                    });
                }
            }];
        };

        // TODO : This method is temporary; will probably get replaced by something like getCommandsForEdge
        this.onEdgeCommand = function (edge, renderer) {
            // Remove the edge from the screen
            renderer.removeEdge(edge);

            // Remove the edge from the graph
            var i = edge.source.link_out.indexOf(edge);
            if (i >= 0)
                edge.source.link_out.splice(i, 1);

            i = edge.target.link_in.indexOf(edge);
            if (i >= 0)
                edge.target.link_in.splice(i, 1);

            i = this.graph.edges.indexOf(edge);
            if (i >= 0)
                this.graph.edges.splice(i, 1);

            // Remove the edge from the DB
            var key = 'link:' + edge.source.id + ':' + edge.target.id;
            var data = {};
            data[key] = null;
            GraphState.save(selfRef.name, data);
        };
    }

    LogicalHost.prototype = base;

    return LogicalHost;
});
