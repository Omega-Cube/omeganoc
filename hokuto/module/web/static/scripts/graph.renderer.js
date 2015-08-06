"use strict"
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

/*
* OmegaNoc Renderer implementation, using svg.js
*/

define(['jquery', 'graph.tooltip', 'graph', 'console', 'onoc.createurl', 'onoc.loadcss', 'onoc.loop', 'jquery.mousewheel', 'svg', 'svg.easing'],
function (jQuery, Tooltip, Grapher, Console, createUrl, loadCss, registerLoop) {
    // NOTE : Grapher is a circular dependency, it will therefore be undefined at the time this function gets called !
    var Bubbles = function (element, graph, graphType) {
        var selfRef = this;
        this.graph = graph;
        this.graphType = graphType;

        // The radius of the drawing used to represent a node on the graph (does not include label)
        this.radius = 30;

        this.groupPadding = 20; // The (approximate) padding applied to group containers, in pixels

        this.dragScrollThreshold = 50; // The distance from the border at which the mouse pointer will trigger a drag
        this.dragScrollSpeed = 400; // The speed (pixel/frame) at which the graph will pan when drag-scrolling
        this.panSpeed = { x: 0, y: 0 }; // The currently applied panning speed.

        // Limit that separates "small" nodes from "big" ones.
        // Basically we will display differently nodes that are
        // a radius below and above this limit...
        this.smallRadiusThreshold = 20;

        // Contains the promise of any currently running panning animation
        this.panAnimationPromise = null;

        // When true, panning beyond the limits of the current graph bounds is allowed.
        // It is recommended to use _unlockExtend and _lockExtend to change this state
        // as they ensure that the state of the graph stays consistent.
        this._allowExtend = false;

        this.lockSquareGroups = true; // If true, drawn groups height and width will always be equal so they appear square.
                                      // Otherwise they will be rectangles
        
        // Size of the current graph on the screen
        this.width = 0;
        this.height = 0;

        this.getElement = function () {
            return element;
        }

        // The moving container
        this.panX = 0; // v
        this.panY = 0; // Holds the current X and Y panning position
        this.container = document.createElement('div');
        this.container.id = 'graph';
        this.container.style.position = 'absolute';
        this.container.style.zIndex = 700;
        var $container = jQuery(this.container);

        // The SVG container
        this.svg = SVG(this.container).size(100, 100);
        selfRef._updateGraphSize();

        this.upImage = document.getElementById("up");

        // The overview container
        // A div that contains all of the overview
        this.overviewWidth = 0;
        this.overviewHeight = 0;
        this.overviewRatio = 0;
        this._computeOverviewSize();
        this.overviewContainer = document.createElement('div');
        this.overviewContainer.id = 'g-o';
        this.overviewContainer.style.width = this.overviewWidth + 'px';
        this.overviewContainer.style.height = this.overviewHeight + 'px';
        this.overviewContainer.style.zIndex = 800;
        element.appendChild(this.overviewContainer);
        var $overviewContainer = jQuery(this.overviewContainer);

        // Overview graph
        this.miniSvg = SVG(this.overviewContainer)
            .size(this.svg.width(), this.svg.height());

        // The overview selector
        // Highlights the currently visible portion of the screen in the overview
        this.overviewSelector = document.createElement('div');
        this.overviewSelector.id = 'g-os';
        this.overviewSelector.style.left = '0px';
        this.overviewSelector.style.top = '0px';
        this.overviewContainer.appendChild(this.overviewSelector);
        this._updateOverviewSize();
        var $overviewSelector = jQuery(this.overviewSelector);

        // The collapse/show overview button
        this.overviewToggle = document.createElement('div');
        this.overviewToggle.id = 'g-ot';
        this.overviewToggle.title = 'Toggle overview visibility';
        this.overviewToggle.className = 'toggle-visible';
        this.overviewToggle.style.zIndex = 801;
        element.appendChild(this.overviewToggle);
        var toggleImg = document.createElement('img');
        toggleImg.src = createUrl('static/images/arrow_right.png');
        toggleImg.alt = '';
        this.overviewToggle.appendChild(toggleImg);
        var $overviewToggle = jQuery(this.overviewToggle);        
        
        // The selection rectangle
        this.selectionRectangle = this.svg.rect(0, 0).attr({ 'class': 'select-rect' }).hide();

        // The commands stuff
        this.commandCurrentNode = null; // The node on which commands are shown; null if commands are not shown !
        this.commandBg = null; // Background shape for the commands
        this.commandIcons = []; // Shapes for the command buttons

        /* 
         * Internal data
         */

        // Flag which will tell us whether or not the overview is dirty
        this.overviewIsDirty = false;

        // List of currently selected nodes and edges
        this.selectedNodes = [];
        this.selectedEdges = [];
        this.selectedGroups = [];

        /*
         * Mouse operations
         */

        // Describes what the mouse is currently doing
        this.currentMouseOperation = Bubbles.MOUSE_OPERATION_NONE;

        // Mouse position; updated only when useful
        // These are stored in graph coordinates (not document coordinates)
        // except when the operation involves the overview
        this.mousex = 0;
        this.mousey = 0;

        // Element targeted by the mouse during drag operations
        this.draggingTarget = null;

        // This is called on a node's onmousedown event (on the ellipse or the text)
        this._onShapeMouseDown = function (e) {
            e = jQuery.event.fix(e);

            var pos = selfRef.getGraphCoords(e.clientX, e.clientY);
            selfRef.mousex = pos[0];
            selfRef.mousey = pos[1];

            selfRef.draggingTarget = this;

            selfRef.currentMouseOperation = Bubbles.MOUSE_OPERATION_DRAGGING;
            selfRef._unlockExtend();

            e.preventDefault();
            e.stopPropagation();

            // Hide the tooltip during the drag operation so it doesn't get in the way
            selfRef._hideTooltip();
            // Same with the commands
            selfRef.hideCommands();
        };

        this._onEllipseMouseOver = function (e) {
            // Do not display the tooltip during user manipulations
            var node = this.parent.dataNode;
            if (selfRef.currentMouseOperation === Bubbles.MOUSE_OPERATION_NONE) {
                selfRef._showTooltip(this instanceof SVG.Ellipse ? this.parent : this, node.label);

                // Show the command menu if the node is currently selected
                if (node.selected) {
                    selfRef.showCommands(node);
                }
            }
            else if (selfRef.currentMouseOperation === Bubbles.MOUSE_OPERATION_DRAW_LINK) {
                // Ask whether this node is an acceptable destination for the new link
                var link = selfRef.draggingTarget;
                var accept = (link._startNode !== node); // Accept by default, except if the mouse is over the starting node itself
                if (accept && link._feedbackCallback) { // Did the user provide accept rules ?
                    accept = link._feedbackCallback(node);
                }

                if (accept) {
                    Console.log('TODO : Implement accept glow');
                    ///var glow = this.set[0].glow({
                    ///    color: 'green'
                    ///});
                    ///link._glow = glow;
                    link._hoverNode = node;

                    // Move the link preview to the center of the node
                    link.animate(500, SVG.easing.elastic).attr({
                        'x1': link._startNode.renderX,
                        'y1': link._startNode.renderY,
                        'x2': node.renderX,
                        'y2': node.renderY,
                    });
                }
                else {
                    ///var glow = this.set[0].glow({
                    ///    color: 'red'
                    ///});
                    ///link._glow = glow;
                    Console.log('TODO : Implement reject glow')
                }


            }
        };

        this._onEllipseMouseOut = function () {
            // Hide the tooltip
            selfRef._hideTooltip();

            if (selfRef.currentMouseOperation === Bubbles.MOUSE_OPERATION_DRAW_LINK) {
                var link = selfRef.draggingTarget;
                ///if (link._glow) {
                ///    link._glow.remove();
                ///    link._glow = null;
                ///}

                if (link._hoverNode) {
                    link._hoverNode = null;
                }
            }
        };

        this._onEllipseDoubleClick = function (e) {
            jQuery(selfRef.getElement()).trigger('activate', [this.set.dataNode]);
        };

        this._onEllipseMouseDown = function (e) {
            var node = this.parent.dataNode;

            if (e.ctrlKey) {
                selfRef._updateNodeSelection(node, !node.selected);
                selfRef._onSelectionChanged();
            }
            else if (!node.selected) {
                // If the clicked node is not selected -> select it and make
                // all the other nodes not-selected. Same goes for the edges.

                selfRef.clearSelection();

                selfRef._updateNodeSelection(node, true);
                selfRef._onSelectionChanged();
            }

            // Bring the node to the front
            node.shape.front();
        };

//        this._onEdgeCommanderLeftClick = function (e) {
//            e.stopPropagation();
//            console.log("left (to source) button clicked");
//        };
//
//        this._onEdgeCommanderRightClick = function (e) {
//            e.stopPropagation();
//            console.log('right (to target) button clicked');
//        };

        this._onEdgeCommanderCenterClicked = function (e) {
            e.stopPropagation();
            if (selfRef.graphType.onEdgeCommand)
                selfRef.graphType.onEdgeCommand(this.parent._edge, selfRef)
        };

        this._onEdgeCommanderMouseDown = function (e) {
            e.stopPropagation();
        };

        this._onGroupMouseDown = function (e) {
            e = jQuery.event.fix(e);
            // Select all the nodes inside that group
            var group = this.parent.group;
            if (e.ctrlKey) {
                selfRef._updateGroupSelection(group, !group.selected);
                selfRef._onSelectionChanged();
            }
            else if (!group.selected) {
                selfRef.clearSelection();
                selfRef._updateGroupSelection(group, true);
                selfRef._onSelectionChanged();
            }

            var pos = selfRef.getGraphCoords(e.clientX, e.clientY);
            selfRef.mousex = pos[0];
            selfRef.mousey = pos[1];

            selfRef.draggingTarget = this;

            selfRef.currentMouseOperation = Bubbles.MOUSE_OPERATION_DRAGGING;
            selfRef._unlockExtend();

            // Hide the tooltip during the drag operation so it doesn't get in the way
            selfRef._hideTooltip();
            // Same with the commands
            selfRef.hideCommands();


            e.stopPropagation();
            e.preventDefault();

        };

        $container.mousedown(function (e) {
            var pos = selfRef.getGraphCoords(e.clientX, e.clientY);
            selfRef.mousex = pos[0];
            selfRef.mousey = pos[1];

            // NOTE : If we clicked on a node, the event will not propagate up to here,
            // so we won't receive the event.

            // Create the selection rectangle. 
            // Since we're not over a node nor over the overview, then it's a good place to do this
            selfRef.currentMouseOperation = Bubbles.MOUSE_OPERATION_SELECTING;
            selfRef.clearSelection();
            selfRef._startSelectionRectangle(e);

            e.preventDefault();

            // NOTE : mouseup is handled on the document, not on the container !
        });

        $container.mousemove(function (e) {
            if (selfRef.currentMouseOperation === Bubbles.MOUSE_OPERATION_DRAGGING)
                selfRef._moveSelectedNodesByDragging(e);
            else if (selfRef.currentMouseOperation === Bubbles.MOUSE_OPERATION_SELECTING)
                selfRef._drawSelectionRectangle(e);
            else if (selfRef.currentMouseOperation === Bubbles.MOUSE_OPERATION_DRAW_LINK)
                selfRef._updateUserLinkPreview(e);
        });

        $overviewSelector.mousedown(function (e) {
            // If the graph is big enough for panning to be available, start panning
            if (!selfRef.isGraphSmallerThanViewport()) {
                selfRef.currentMouseOperation = Bubbles.MOUSE_OPERATION_OVERVIEW_PANNING;
                selfRef.mousex = e.clientX;
                selfRef.mousey = e.clientY;

                e.preventDefault();
            }
        });

        $overviewSelector.mousemove(function (e) {
            if (selfRef.currentMouseOperation == Bubbles.MOUSE_OPERATION_OVERVIEW_PANNING) {
                var deltaX = selfRef.mousex - e.clientX;
                var deltaY = selfRef.mousey - e.clientY;

                selfRef.pan(-deltaX / selfRef.overviewRatio, -deltaY / selfRef.overviewRatio);

                selfRef.mousex = e.clientX;
                selfRef.mousey = e.clientY;
            }
        });

        $overviewSelector.mouseup(function (e) {
            selfRef.currentMouseOperation = Bubbles.MOUSE_OPERATION_NONE;
        })

        // Single key pressed event
        jQuery(document).keydown(function (e) {
            // Variable which will store the keycode for each key of the keyboard
            var keycode = e.which;

            // If there are no selected hosts and arrows are pressed - pan the screen by 300 pixels,
            // else, move them by 10 pixels to the desired direction
            if (selfRef.selectedNodes.length === 0)
                selfRef.panScreen(keycode, 300); // TODO : refactor; panScreen should not take a key code but a direction
            else
                selfRef.moveSelectedNodesWithArrows(keycode, 10);
        });

        document.onmouseup = function () {
            if (selfRef.currentMouseOperation === Bubbles.MOUSE_OPERATION_DRAGGING) {

                if (selfRef.draggingTarget.dataNode) {
                    var node = selfRef.draggingTarget.dataNode;
                    // Restore the tooltip
                    selfRef._showTooltip(selfRef.draggingTarget, node.label);
                    // Restore the commands
                    selfRef.showCommands(node);
                }

                // Save the new positions

                for (var i = 0, c = selfRef.selectedNodes.length; i < c; i++)
                    selfRef.computeAndSaveNewLayoutCoordinates(selfRef.selectedNodes[i]);

                // Update the overview if necessary
                if (selfRef.overviewIsDirty) {
                    selfRef.updateDirtyOverview();
                    selfRef.overviewIsDirty = false;
                }

                // Remove the reference to the dragged element
                selfRef.draggingTarget = null;

                // Turn off the extend mode
                selfRef._lockExtend();

                // Stop panning the screen
                selfRef.panSpeed.x = 0;
                selfRef.panSpeed.y = 0;
            }
            else if (selfRef.currentMouseOperation === Bubbles.MOUSE_OPERATION_SELECTING) {
                // Select the elements inside the rectangle
                selfRef.rectangleSelectionOfNodes();
                // Hide the rectangle
                selfRef.selectionRectangle.hide();
                // Notify of the new selection
                selfRef._onSelectionChanged();
            }
            else if (selfRef.currentMouseOperation === Bubbles.MOUSE_OPERATION_DRAW_LINK) {
                var link = selfRef.draggingTarget;
                var keep = false;
                // Are we above a node ?
                if (link._hoverNode) {
                    // yes !
                    keep = link._successCallback(link._hoverNode);
                }
                else if (link._abortCallback) {
                    link._abortCallback();
                }

                // Destroy the preview
                ///if (link._glow) {
                ///    link._glow.remove();
                ///    link._glow = null;
                ///}

                // If we should keep the link, convert the preview line into an actual link line
                if (keep) {
                    selfRef._drawEdge(keep);
                    if (link._startNode.selected)
                        selfRef.selectedEdges.push(keep);
                }

                link.remove();

                delete link._abortCallback;
                delete link._successCallback;
                delete link._startNode;

                selfRef.draggingTarget = null;
            }

            selfRef.currentMouseOperation = Bubbles.MOUSE_OPERATION_NONE;
        };

        jQuery(document).on('columnsresized.onoc', function () {
            // Change the size of the canvas to the size of the element if the graph is too small
            selfRef._checkCanvasSize($(window).width(), selfRef.getElement().offsetHeight)
            selfRef._secureGraphPosition();
            selfRef._updateOverviewSize();
        });

        jQuery(document).on('select_element.onoc', function (e, data) {
            if (data.source === 'treeview') {
                // Set the current selection to the nodes that were selected in the treeview
                selfRef.clearSelection();
                var focus = null;
                for (var i = 0, c = data.selection.length; i < c; ++i) {
                    if (data.selection[i] in selfRef.graph.nodes) {
                        focus =selfRef.graph.nodes[data.selection[i]];
                        selfRef._updateNodeSelection(focus, true);
                        selfRef.flashNode(focus);
                    }
                    if (data.selection[i] in selfRef.graph.groups) {
                        focus = selfRef.graph.groups[data.selection[i]];
                        selfRef._updateGroupSelection(focus, true);
                        selfRef.flashNode(focus);
                    }
                }

                if (focus) {
                    selfRef.panToNode(focus, true);
                }
            }
        });

        jQuery(window).resize(function () {
            selfRef._checkCanvasSize($(window).width(), selfRef.getElement().offsetHeight)
            selfRef._secureGraphPosition();
            selfRef._updateOverviewSize();
        });

        $container.mousewheel(function (e) {
            var delta = e.originalEvent.wheelDelta;

            if (e.ctrlKey) {
                // Invert X and Y axis
                // This is mostly for people with a classic wheel with just a Y axis, so
                // they can also horizontally scroll by pressing ALT
                var buf = e.deltaX;
                e.deltaX = -e.deltaY;
                e.deltaY = -buf;

                // Please do not zoom mr. browser thxbye
                e.preventDefault();
            }

            selfRef.pan(e.deltaX * e.deltaFactor, -e.deltaY * e.deltaFactor, e);

        });
        
        $overviewToggle.click(function() {
            var $this = $(this);
            $overviewToggle.toggleClass('toggle-collapsed');
            $overviewContainer.slideToggle();
        });

        // Load the CSS file
        loadCss(createUrl('static/css/graph.renderer.css'));

        // Create all the graph into the container
        this._draw();
        this.updateDirtyOverview();

        // Put the container inside the page
        element.appendChild(this.container);

        registerLoop(function (deltaT) {
            var sDeltaT = deltaT / 1000;
            selfRef.pan(selfRef.panSpeed.x * sDeltaT, selfRef.panSpeed.y * sDeltaT);
        });
    };

    Bubbles.prototype = {
        _draw: function () {
            var i, c;
            for (i in this.graph.groups) {
                this._drawGroup(this.graph.groups[i]);
            }
            for (i in this.graph.nodes) {
                this._drawNode(this.graph.nodes[i]);
            }
            for (i = 0, c = this.graph.edges.length; i < c; i++) {
                this._drawEdge(this.graph.edges[i]);
            }
        },

        _drawNode: function (node) {
            this._prepareNode(node);

            // if node has already been drawn, move the nodes
            if (node.shape) {
                return this._updateNodePosition(node);
            } // else, draw new nodes


            var shape = this.svg.group().attr({
                'class': 'node ' + this._getNodeTypeClass(node),
            });

            // Text
            var text = shape.plain(node.label || node.id).attr({
                'x': 0,
                'y': node.radius + 20,
                'text-anchor': 'middle'
            });
            if (node.radius <= this.smallRadiusThreshold) {
                text.hide();
            }

            var ellipse = shape.ellipse(node.radius * 2, node.radius * 2).attr({
                'cx': 0,
                'cy': 0,
            });
            ellipse.set = shape;

            // Subscribe to some events
            ellipse.mouseover(this._onEllipseMouseOver);
            ellipse.mouseout(this._onEllipseMouseOut);
            ellipse.dblclick(this._onEllipseDoubleClick);
            ellipse.mousedown(this._onEllipseMouseDown);


            // Draw overview equivalent
            var miniEllipse = this.miniSvg.ellipse(node.radius * 2, node.radius * 2).attr({
                'class': 'mini node ' + this._getNodeTypeClass(node),
            });

            // re-reference to the node an element belongs to, needed for dragging all elements of a node
            shape.mousedown(this._onShapeMouseDown);

            node.shape = shape;
            node.miniShape = miniEllipse;
            shape.dataNode = node;
            miniEllipse.dataNode = node;

            // Apply graphical styles
            this._applyNormalNodeStyle(node);

            this._updateNodePosition(node);

            return node;
        },

        _drawEdge: function (edge, animated) {
            // Check that the edge wasn already drawn
            if (!edge.connection) {

                edge.connection = this._createEdgeLine(this.svg, edge.source.renderX, edge.source.renderY, edge.target.renderX, edge.target.renderY, edge.source.label, edge.target.label, animated);

                edge.miniConnection = this._createEdgeLine(this.miniSvg, edge.source.renderX, edge.source.renderY, edge.target.renderX, edge.target.renderY, edge.source.label, edge.target.label, animated);

                if (edge.source.selected)
                    this._applySelectedEdgeStyle(edge);
                else
                    this._applyNormalEdgeStyle(edge);
            }
        },

        _createEdgeLine: function (canvas, x1, y1, x2, y2, sourceNode, destinationNode, animated) {
            animated = !!animated;
            var result = canvas.line(x1, y1, x2, +y2).back();
            if (animated)
                result.opacity(0).animate(500).opacity(1);

            return result;
        },

        _drawGroup: function (group) {
            // Do some data preparation
            this._prepareGroup(group);

            var shape = group.shape = this.svg.group().attr({
                'class': 'group' + this._getNodeTypeClass(group)
            });
            var text = shape.plain(group.label).attr({
                'text-anchor': 'middle'
            });
            var ellipse = shape.ellipse(1, 1);

            group.miniShape = this.miniSvg.ellipse(1, 1).attr({
                'class': 'mini group',
            });

            group.shape.group = group;
            group.miniShape.group = group;
            ellipse.mousedown(this._onGroupMouseDown);

            this._updateGroupPosition(group, false, true);
        },

        // Prepares a node before it can be used by the renderer
        _prepareNode: function (node) {
            // We copy the positions into render-specific attribute so we can manipulate them without
            // interfering with other components
            node.renderX = node.x;
            node.renderY = node.y;
        },

        _prepareGroup: function(group) {
            group._selectionCount = 0;
        },

        _updateNodePosition: function (node, animate) {
            animate = !!animate;

            var shape = node.shape;
            if (animate)
                shape = shape.animate(500);
            shape.x(node.renderX).y(node.renderY);

            node.miniShape.cx(node.renderX).cy(node.renderY);

            return node;
        },

        _updateGroupPosition: function (group, animate, dontUpdateData) {
            var shape = group.shape;
            var text = shape.get(0);
            var ellipse = shape.get(1);
            if(!dontUpdateData)
                group.updateBbox();
            if (animate) {
                shape = shape.animate(500);
                text = text.animate(500);
                ellipse = ellipse.animate(500);
            }

            var x = (group.bbox.left + group.bbox.right) / 2;
            var y = (group.bbox.top + group.bbox.bottom) / 2;
            var rx, ry, textPos;
            
            if(this.lockSquareGroups) {
                var highSide = Math.max(group.bbox.width, group.bbox.height);
                var radius = Math.sqrt(2 * highSide * highSide) * 0.5;
                rx = radius + this.groupPadding;
                ry = radius + this.groupPadding;
                textPos = radius + this.groupPadding + 20;
            }
            else {
                rx = group.bbox.width * 0.7 + this.groupPadding;
                ry = group.bbox.height * 0.7 + this.groupPadding;
                textPos = (group.bbox.height * 0.7) + this.groupPadding + 20
            }
            shape.x(x).y(y);

            ellipse.attr({
                'rx': rx,
                'ry': ry,
            });

            text.attr({
                'y': textPos
            });

            group.miniShape.attr({
                'cx': x,
                'cy': y,
                'rx': rx,
                'ry': ry,
            });
        },

        _updateEdgePosition: function (edge) {
            edge.connection.plot(edge.source.renderX, edge.source.renderY, edge.target.renderX, edge.target.renderY);
            edge.miniConnection.plot(edge.source.renderX, edge.source.renderY, edge.target.renderX, edge.target.renderY);

            this._computeEdgeCommanderPosition(edge);
            this._computeEdgeCommanderDirection(edge);
            this._updateEdgeCommander(edge);
        },

        _moveNodeTo: function (node, x, y) {
            node.renderX = x;
            node.renderY = y;

            this._updateNodePosition(node);
        },

        _moveNodesBy: function (nodes, xCoef, yCoef) {
            for (var i = 0, c = nodes.length; i < c; i++) {
                nodes[i].renderX += xCoef;
                nodes[i].renderY += yCoef;

                this._updateNodePosition(nodes[i]);
            }
        },

        _moveSelectedNodesByDragging: function (e) {
            var curMouse = this.getGraphCoords(e.clientX, e.clientY);

            var deltaX = this.mousex - curMouse[0];
            var deltaY = this.mousey - curMouse[1];

            // Move nodes
            var coordX, coordY;
            var node = null;
            var groups = {}; // Holds a list of groups that contains moved nodes
            var cancelX = false, cancelY = false;
            var positions = [];
            for (var i = 0, c = this.selectedNodes.length; i < c; i++) {
                node = this.selectedNodes[i];

                coordX = node.renderX - deltaX;
                coordY = node.renderY - deltaY;

                if (coordX < 0)
                    cancelX = true;
                if (coordY < 0)
                    cancelY = true;

                positions.push([coordX, coordY]);
                //this._moveNodeTo(node, coordX, coordY);

                if (node.group) {
                    if (node.group.id in groups) {
                        --groups[node.group.id];
                    }
                    else {
                        groups[node.group.id] = node.group.length - 1;    // We store the amount of children in the group
                                                                                // and decrement for each children found so that
                                                                                // groups with a count of 0 are not updated
                    }

                }
            }

            if (!cancelX) {
                if (cancelY) {
                    for (i = 0; i < c; ++i) {
                        node = this.selectedNodes[i];
                        this._moveNodeTo(node, positions[i][0], node.renderY);
                        node.bbox.left = node.renderX - node.radius;
                        node.bbox.right = node.renderX + node.radius;
                        node.bbox.top = node.renderY - node.radius;
                        node.bbox.bottom = node.renderY + node.radius;
                    }
                }
                else {
                    for (i = 0; i < c; ++i) {
                        node = this.selectedNodes[i];
                        this._moveNodeTo(node, positions[i][0], positions[i][1]);
                        node.bbox.left = node.renderX - node.radius;
                        node.bbox.right = node.renderX + node.radius;
                        node.bbox.top = node.renderY - node.radius;
                        node.bbox.bottom = node.renderY + node.radius;
                    }
                }

            }
            else if (!cancelY) {
                for (i = 0; i < c; ++i) {
                    node = this.selectedNodes[i];
                    this._moveNodeTo(node, node.renderX, positions[i][1]);
                    node.bbox.left = node.renderX - node.radius;
                    node.bbox.right = node.renderX + node.radius;
                    node.bbox.top = node.renderY - node.radius;
                    node.bbox.bottom = node.renderY + node.radius;
                }
            }


            // Move groups
            for (var i = 0, c = this.selectedGroups.length; i < c; i++) {
                // Manually update the bbox, which will be much faster than
                // scanning all of the nodes again
                this.selectedGroups[i].bbox.left -= deltaX;
                this.selectedGroups[i].bbox.right -= deltaX;
                this.selectedGroups[i].bbox.top -= deltaY;
                this.selectedGroups[i].bbox.bottom -= deltaY;
                // Adding the group in the groups dict will force the update in the next phase
                groups[this.selectedGroups[i].id] = 1;
            }

            // Update the size of groups whose nodes were moved
            for (var groupid in groups) {
                if (groups[groupid] > 0) {
                    this.graph.groups[groupid].updateBbox();
                    this._updateGroupPosition(this.graph.groups[groupid]);
                }

            }

            // If the mouse get too close to the viewport limits, try to pan around
            var width = this.getElement().offsetWidth;
            var height = this.getElement().offsetHeight;
            this.panSpeed.x = 0;
            this.panSpeed.y = 0;
            if (curMouse[0] < this.panX + this.dragScrollThreshold) {
                this.panSpeed.x -= -(curMouse[0] - this.panX - this.dragScrollThreshold) / this.dragScrollThreshold;
            }
            else if (curMouse[0] > this.panX + width - this.dragScrollThreshold) {
                this.panSpeed.x += (curMouse[0] - this.panX - width + this.dragScrollThreshold) / this.dragScrollThreshold;
            }
            if (curMouse[1] < this.panY + this.dragScrollThreshold) {
                this.panSpeed.y -= -(curMouse[1] - this.panY - this.dragScrollThreshold) / this.dragScrollThreshold;
            }
            else if (curMouse[1] > this.panY + height - this.dragScrollThreshold) {
                this.panSpeed.y += (curMouse[1] - this.panY - height + this.dragScrollThreshold) / this.dragScrollThreshold;
            }

            this.panSpeed.x = this.panSpeed.x * this.dragScrollSpeed;
            this.panSpeed.y = this.panSpeed.y * this.dragScrollSpeed;

            this._updateConnections();

            if(!cancelX)
                this.mousex = curMouse[0];
            if(!cancelY)
                this.mousey = curMouse[1];

        },

        _updateConnections: function () {
            for (var i = 0, c = this.selectedEdges.length; i < c; ++i) {
                this._updateEdgePosition(this.selectedEdges[i]);
            }
        },

        _onSelectionChanged: function() {
            var selectedIds = [];
            for (var i = 0, c = this.selectedNodes.length; i < c; ++i) {
                selectedIds.push(this.selectedNodes[i].id);
            }

            jQuery(document).trigger('select_element.onoc', {'selection': selectedIds, 'source': 'graph'});
        },

        // Pans the graph by the specified amount of pixels
        // The e parameter may be filled by the caller with an event object
        // In that case, pan() may trigger a few visual updates, using
        // the provided event to read the keys, mouse position, etc...
        pan: function (x, y, e) {
            if (!x && !y)
                return;

            this.panX += x;
            this.panY += y;

            this._secureGraphPosition();

            if (e) {
                switch (this.currentMouseOperation) {
                    case Bubbles.MOUSE_OPERATION_SELECTING:
                        this._drawSelectionRectangle(e);
                        break;
                    case Bubbles.MOUSE_OPERATION_DRAGGING:
                        this._moveSelectedNodesByDragging(e);
                        break;
                    case Bubbles.MOUSE_OPERATION_DRAW_LINK:
                        this._updateUserLinkPreview(e);
                        break;
                }
            }
        },

        // Pans the graph so that the specified point is centered on the view
        panToPoint: function(x, y, e, animated) {
            var elm = this.getElement();
            this.panX = x - (elm.offsetWidth / 2);
            this.panY = y - (elm.offsetHeight / 2);

            this._secureGraphPosition(animated);

            if (e) {
                switch (this.currentMouseOperation) {
                    case Bubbles.MOUSE_OPERATION_SELECTING:
                        this._drawSelectionRectangle(e);
                        break;
                    case Bubbles.MOUSE_OPERATION_DRAGGING:
                        this._moveSelectedNodesByDragging(e);
                        break;
                    case Bubbles.MOUSE_OPERATION_DRAW_LINK:
                        this._updateUserLinkPreview(e);
                        break;
                }
            }
        },

        // Pans the view (if necessary) to bring the node
        // with the specified ID into view.
        // The ID can be either a node or a group
        panToNode: function(id, animated) {
            // Look for the target
            var node = null;

            if (id && id.shape) {
                node = id;
            }
            else if (id in this.graph.nodes) {
                node = graph.nodes[id];
            }
            else if (id in this.graph.groups) {
                node = this.graph.groups[id];
            }

            if (!node) {
                Console.warn('[Bubbles Renderer] Invalid id provided to panTo: ' + id);
                return;
            }

            // If the target node is found closer than this distance from the viewport borders,
            // then we'll still pan to center it on screen
            var visibilityMargin = 50;

            var width = this.getElement().offsetWidth;
            var height = this.getElement().offsetHeight;

            var centerNeeded = false;

            if (node.bbox.left < (this.panX + visibilityMargin) ||
                node.bbox.top < (this.panY + visibilityMargin) ||
                node.bbox.right > (this.panX + width - visibilityMargin) ||
                node.bbox.bottom > (this.panY + height - visibilityMargin)) {
                // Node is out of view, pan the scree

                this.panToPoint(node.bbox.left, node.bbox.top, null, animated);
            }
        },

        // Selects the nodes contained in the provided array
        selectNodes: function(nodes) {
            if (!jQuery.isArray(nodes))
                nodes = [nodes];

            for (var i = 0, c = nodes.length; i < c; ++i) {
                this._updateNodeSelection(nodes[i], true);
            }

            this._onSelectionChanged();
        },

        // Deselects all the nodes
        clearSelection: function () {
            this.hideCommands();

            for (var i = 0, c = this.selectedNodes.length; i < c; ++i) {
                this._applyNormalNodeStyle(this.selectedNodes[i]);
                this.selectedNodes[i].selected = false;
            }

            for (var i = 0, c = this.selectedEdges.length; i < c; ++i) {
                this._applyNormalEdgeStyle(this.selectedEdges[i]);
                this.selectedEdges[i].selected = false;
            }

            for (var i = 0, c = this.selectedGroups.length; i < c; ++i) {
                this.selectedGroups[i]._selectionCount = 0;
                this.selectedGroups[i].selected = false;
            }

            this.selectedNodes = [];
            this.selectedEdges = [];
            this.selectedGroups = [];
        },

        _updateGraphSize: function () {
            // Determines the ideal size of the graph
            this.width = (this.graph.bbox.right) + 100;
            this.height = (this.graph.bbox.bottom) + 100;

            if (this.width <= this.getElement().offsetWidth) {
                if (this.height <= this.getElement().offsetHeight) {
                    this.width = this.getElement().offsetWidth;
                    this.height = this.getElement().offsetHeight;
                }
                else this.width = this.getElement().offsetWidth;
            }
            else if (this.height <= this.getElement().offsetHeight) this.height = this.getElement().offsetHeight;

            // Make sure the canvas is big enough to contain the graph
            this._checkCanvasSize(this.width, this.height);
        },

        // Makes sure the graph is correctly placed in its container and fixes it if necessary.
        _secureGraphPosition: function (animated) {
            var vpWidth = this.getElement().offsetWidth;
            var vpHeight = this.getElement().offsetHeight;
            var maxX = Math.max(0, this.width - vpWidth);
            var maxY = Math.max(0, this.height - vpHeight);

            // Stop any already running animation
            if (this.panAnimationPromise) {
                jQuery(this.container).stop();
            }

            var needsExtend = false;

            if (this.panX < 0)
                this.panX = 0;
            if (this.panY < 0)
                this.panY = 0;
            if (this.panX > maxX) {
                if (this._allowExtend)
                    needsExtend = true;
                else
                    this.panX = maxX;
            }
            if (this.panY > maxY) {
                if (this._allowExtend)
                    needsExtend = true;
                else
                    this.panY = maxY;
            }

            if (needsExtend) // If we expand beyond the current borders, make sure that the canvas is big enough to draw on
                this._checkCanvasSize(this.panX + vpWidth, this.panY + vpHeight);

            if (animated) {
                var selfRef = this;
                jQuery(this.container).animate({
                    'top': -this.panY,
                    'left': -this.panX,
                }, {
                    duration: 400,
                    queue: false,
                    start: function (promise) {
                        selfRef.panAnimationPromise = promise;
                    },
                    always: function () {
                        selfRef.panAnimationPromise = null;
                    },
                });
            }
            else {
                this.container.style.top = -this.panY + 'px';
                this.container.style.left = -this.panX + 'px';
            }

            this._updateOverviewPosition();
        },

        _computeOverviewSize: function () {
            // Maximum width or height of the overview 
            var maxSideSize = 250;

            if (this.width > this.height) {
                this.overviewRatio = maxSideSize / this.width;
                this.overviewWidth = maxSideSize;
                this.overviewHeight = this.height * this.overviewRatio;
            }
            else {
                this.overviewRatio = maxSideSize / this.height;
                this.overviewWidth = this.width * this.overviewRatio;
                this.overviewHeight = maxSideSize;
            }
        },

        // Update position of the overview position indicator
        _updateOverviewPosition: function () {
            this.overviewSelector.style.left = (this.panX * this.overviewRatio) + "px";
            this.overviewSelector.style.top = (this.panY * this.overviewRatio) + "px";
        },

        // Update size of the overview position indicator
        _updateOverviewSize: function () {
            var vp = jQuery(this.getElement());
            var vpw = vp.width();
            var vph = vp.height();
            // We remove 4px from width and height so we can still see the 2px border when the 
            // viewport indicator is on the bottom-right side
            var w = (vpw * this.overviewRatio) - 4;
            var h = (vph * this.overviewRatio) - 4;
            if (w > this.overviewWidth - 4)
                w = this.overviewWidth - 4;
            if (h > this.overviewHeight - 4)
                h = this.overviewHeight - 4;

            this.overviewSelector.style.width = w + "px";
            this.overviewSelector.style.height = h + "px";

            this.overviewContainer.style.width = this.overviewWidth + 'px';
            this.overviewContainer.style.height = this.overviewHeight + 'px';

            this.miniSvg.size(this.svg.width() * this.overviewRatio, this.svg.height() * this.overviewRatio)
                        .viewbox(0, 0, this.svg.width(), this.svg.height());
        },

        // Applies all the changes needed on a node to select or deselect it
        _updateNodeSelection: function (node, isSelected) {
            if (isSelected === node.selected)
                return;

            node.selected = isSelected;
            if (isSelected) {
                this.selectedNodes.push(node);
                // Change appearance
                this._applySelectedNodeStyle(node);
                // Also select all the edges coming from this node
                this._selectEdges(node);
                // Check if we now have a full group selected
                if (node.group) {
                    node.group._selectionCount += 1;
                    if (node.group._selectionCount === node.group.length) {
                        // Group is selected !
                        this.selectedGroups.push(node.group);
                        node.group.selected = true;
                    }
                }
            }
            else {
                for (var i = 0, c = this.selectedNodes.length; i < c; ++i) {
                    if (this.selectedNodes[i] === node) {
                        this._deSelectEdges(node);
                        this.selectedNodes.splice(i, 1);
                        if (node.group) {
                            node.group._selectionCount -= 1;
                            for(var j = 0, d = this.selectedGroups.length; j < d; ++j) {
                                if(this.selectedGroups[j] === node.group) {
                                    this.selectedGroups.splice(j, 1);
                                    node.group.selected = false;
                                    break;
                                }
                            }
                        }
                        break;
                    }
                }
                this._applyNormalNodeStyle(node);
            }
        },

        _updateGroupSelection: function (group, isSelected) {
            if (isSelected == group.selected)
                return;

            for (var id in group.nodes) {
                this._updateNodeSelection(group.nodes[id], isSelected);
            }

            // The actual group data is updated by _updateNodeSelection so we're good here
        },

        _updateEdgeSelection: function (edge, isSelected) {
            if (edge.selected === isSelected)
                return;

            edge.selected = isSelected;
            if (isSelected) {
                this.selectedEdges.push(edge);
                this._applySelectedEdgeStyle(edge);
            }
            else {
                for (var i = 0, c = this.selectedEdges.length; i < c; ++i) {
                    if (this.selectedEdges[i] === edge) {
                        this.selectedEdges.splice(i, 1);
                        this._applyNormalEdgeStyle(edge);
                        break;
                    }
                }
            }
        },

        _applyNormalNodeStyle: function (node) {
            node.shape.removeClass('selected');
            node.miniShape.removeClass('selected');
        },

        _applySelectedNodeStyle: function (node) {
            node.shape.addClass('selected');
            node.miniShape.addClass('selected');
        },

        _getNodeTypeClass: function (node) {
            if (node.shinken_type) {
                return ' type-' + node.shinken_type;
            }
            else {
                return '';
            }
        },

        _applyNormalEdgeStyle: function (edge) {
            edge.connection.attr({ 'class': 'edge' });
            edge.miniConnection.attr({ 'class': 'edge mini' });

            this._removeEdgeCommander(edge);
        },

        _applySelectedEdgeStyle: function (edge) {
            var selectionClasses = '';
            if (edge.source.selected) {
                selectionClasses += ' s-selected';
            }
            if (edge.target.selected) {
                selectionClasses += ' t-selected';
            }

            edge.connection.attr({ 'class': 'edge' + selectionClasses });
            edge.miniConnection.attr({ 'class': 'edge mini' + selectionClasses });

            this._createEdgeCommander(edge);
        },

        // Selects all the edges coming from the specified node
        _selectEdges: function (node) {
            // Get all the edges linking from this node
            for (var i = 0, c = node.link_out.length; i < c; ++i) {
                this._updateEdgeSelection(node.link_out[i], true);
            }
            for (var i = 0, c = node.link_in.length; i < c; ++i) {
                this._updateEdgeSelection(node.link_in[i], true);
            }
        },

        // Deselect all the edges coming from the specified node
        _deSelectEdges: function (node) {
            for (var i = 0, c = node.link_out.length; i < c; ++i) {
                this._updateEdgeSelection(node.link_out[i], false);
            }
            for (var i = 0, c = node.link_in.length; i < c; ++i) {
                this._updateEdgeSelection(node.link_in[i], true);
            }
        },

        _showTooltip: function (target, content) {
            var bb = target.bbox();
            var coords = this.getDocumentCoords(bb.x, bb.y);
            Tooltip.show(coords[0], coords[1] - 10, bb.width, bb.height, content);
        },

        _hideTooltip: function () {
            Tooltip.hide();
        },

        // Checks if the graph borders are smaller than the borders of the element
        isGraphSmallerThanViewport: function () {
            if (this.width <= this.getElement().offsetWidth &&
                this.height <= this.getElement().offsetHeight)
                return true;
            return false;
        },

        // Compute and save the new layout coordinates
        computeAndSaveNewLayoutCoordinates: function (node) {
            node.x = node.renderX;
            node.y = node.renderY;
            node.updateBbox();
            var Grapher = require('graph');
            Grapher.saveOneNodeCoordinates(node);
        },
        
        // Makes sure all the node positions (x and y members)
        // are up to date
        updateAllNodesPositions: function() {
            for (var n in this.graph.nodes) {
                if(n.x != n.renderX || n.y != n.renderY) {
                    n.x = n.renderX;
                    n.y = n.renderY;
                    n.updateBbox();
                }
            }
        },

        _startSelectionRectangle: function (e) {
            this.selectionRectangle.show();

            // Compute new position
            var pos = this.getGraphCoords(e.clientX, e.clientY);
            this.mousex = pos[0];
            this.mousey = pos[1];

            // Edit the rectangle
            this.selectionRectangle.attr({
                'x': this.mousex,
                'y': this.mousey,
                'width': 0,
                'height': 0
            });
        },

        _drawSelectionRectangle: function (e) {
            // Update rectangle position
            var pos = this.getGraphCoords(e.clientX, e.clientY);

            var x, y, width, height;
            if (pos[0] < this.mousex) {
                x = pos[0];
                width = this.mousex - pos[0];
            }
            else {
                x = this.mousex;
                width = pos[0] - this.mousex;
            }
            if (pos[1] < this.mousey) {
                y = pos[1];
                height = this.mousey - pos[1];
            }
            else {
                y = this.mousey;
                height = pos[1] - this.mousey;
            }

            this.selectionRectangle.attr({
                'x': x,
                'y': y,
                'width': width,
                'height': height
            });

        },

        rectangleSelectionOfNodes: function () {
            var bounds = this.selectionRectangle.bbox();

            var node;

            for (var i in this.graph.nodes) {
                node = this.graph.nodes[i];
                // No test needed if the node is already selected
                if (!node.selected) {
                    var nodeBounds = node.shape.bbox();
                    // Collision test
                    if (!(bounds.x2 <= nodeBounds.x || bounds.x >= nodeBounds.x2 || bounds.y >= nodeBounds.y2 || bounds.y2 <= nodeBounds.y)) {
                        this._updateNodeSelection(node, true);
                    }
                }
            }
        },

        panScreen: function (keycode, panCoef) {
            // If the right arrow is pressed
            if (keycode == 39) this.pan(panCoef, 0);
                // If the left arrow is pressed
            else if (keycode == 37) this.pan(-panCoef, 0);
                // If the up arrow is pressed
            else if (keycode == 38) this.pan(0, -panCoef);
                // If the down arrow is pressed
            else if (keycode == 40) this.pan(0, panCoef);
        },

        moveSelectedNodesWithArrows: function (keycode, moveCoef) {
            var coordX, coordY, node;
            // If the right arrow is pressed
            if (keycode == 39) {
                for (var i = 0, c = this.selectedNodes.length; i < c; i++) {
                    node = this.selectedNodes[i];
                    coordX = node.renderX + moveCoef;
                    coordY = node.renderY;

                    this._moveNodeTo(node, coordX, coordY);
                }
            }
                // If the left arrow is pressed
            else if (keycode == 37)
                for (var i = 0, c = this.selectedNodes.length; i < c; i++)
                    this._moveNodeTo(this.selectedNodes[i], this.selectedNodes[i].renderX - moveCoef, this.selectedNodes[i].renderY);
                // If the up arrow is pressed
            else if (keycode == 38)
                for (var i = 0, c = this.selectedNodes.length; i < c; i++)
                    this._moveNodeTo(this.selectedNodes[i], this.selectedNodes[i].renderX, this.selectedNodes[i].renderY - moveCoef);
                // If the down arrow is pressed
            else if (keycode == 40) {
                for (var i = 0, c = this.selectedNodes.length; i < c; i++) {
                    coordX = this.selectedNodes[i].renderX;
                    coordY = this.selectedNodes[i].renderY + moveCoef;

                    this._moveNodeTo(this.selectedNodes[i], coordX, coordY);
                }
            }
            // Update connections
            this._updateConnections();

            // Compute and save the new layout coordinates
            for (var i = 0, c = this.selectedNodes.length; i < c; i++)
                this.computeAndSaveNewLayoutCoordinates(this.selectedNodes[i]);

            this._secureGraphPosition();
        },

        // Recomputes the size of the overview and applies it
        updateDirtyOverview: function () {
            this._computeOverviewSize();
            this._updateOverviewSize();
        },

        // Disposes all the resources used by the graph
        destroy: function () {
            // TODO : Unsbscribe the SVG events
            // Remove the paper from the dom. jQuery should handle the unsubscribing
            jQuery(this.container).remove();
            jQuery(this.overviewContainer).remove();
            this.container = null;
            this.overviewContainer = null;

            // Clear all SVG objects
            this.svg.clear();
        },

        // Changes the displayed graph
        // the newGraph parameter contains the new data this renderer should display
        // the interpolate parameter is optionnal.
        setGraphData: function (newGraph, newGraphType) {
            var oldGraph = this.graph;
            var selfRef = this;
            this.graph = newGraph;
            this.graphType = newGraphType;

            /////////////////////////////////
            // PREPARE

            this.clearSelection();
            this._hideTooltip();

            // Determine which current elements are going to stay on the graph
            // Also, detach all shapes from the old graph
            var kept_nodes = []; // Nodes that will stay there
            var new_nodes = []; // Nodes that will appear
            var kept_groups = [];
            var new_groups = [];
            var removedElements = []; // Contains shapes that will be removed
            var miniRemovedElements = []; // Shapes that will be removed from the overview
            for (var oldId in oldGraph.nodes) {
                var n = oldGraph.nodes[oldId];
                if (!!newGraph.nodes[n.id]) {
                    kept_nodes.push(n);
                }
                else {
                    removedElements.push(n.shape);
                    miniRemovedElements.push(n.miniShape);
                }
            }

            for (var oldId in oldGraph.groups) {
                var g = oldGraph.groups[oldId];
                if (!!newGraph.groups[g.id]) {
                    kept_groups.push(g);
                }
                else {
                    removedElements.push(g.shape);
                    miniRemovedElements.push(g.miniShape);
                }
            }

            for (var newId in newGraph.nodes) {
                if (!oldGraph.nodes[newId]) {
                    new_nodes.push(newGraph.nodes[newId]);
                }
            }

            for (var newId in newGraph.groups) {
                if (!oldGraph.groups[newId]) {
                    new_groups.push(newGraph.groups[newId]);
                }
            }

            // Include all connections in the set of removed elements.
            for (var i = 0, c = oldGraph.edges.length, e; i < c; ++i) {
                removedElements.push(oldGraph.edges[i].connection);
                miniRemovedElements.push(oldGraph.edges[i].miniConnection);
            }

            /////////////////////////////////
            // APPLY

            // Update the paper's size
            this._updateGraphSize();

            // Hide shapes for nodes that didn't make it
            for (var i in removedElements) {
                removedElements[i].animate(500).opacity(0).after(function () {
                    this.remove();
                });
            }

            for (var i in miniRemovedElements) {
                miniRemovedElements[i].remove();
            }

            // Move survivors
            for (var i = 0, c = kept_nodes.length, o, n; i < c; ++i) {
                n = newGraph.nodes[kept_nodes[i].id];
                o = kept_nodes[i];

                // Transfer shapes from one node to the other
                this._prepareNode(n);
                o.shape.dataNode = n;
                o.miniShape.dataNode = n;

                n.shape = o.shape;
                n.miniShape = o.miniShape;

                delete o.shape;
                delete o.miniShape;

                // Move
                this._updateNodePosition(n, true);
            }

            for (var i = 0, c = kept_groups.length; i < c; ++i) {
                g = newGraph.groups[kept_groups[i].id];
                o = kept_groups[i];

                // Transfer shapes from one group to the other
                this._prepareGroup(g);
                g.shape = o.shape;
                delete o.shape;
                g.miniShape = o.miniShape;
                delete o.miniShape;
                g.shape.group = g;

                // Move
                this._updateGroupPosition(g, true, true);
            }

            // Draw the new elements
            // Groups
            for (var i = 0, c = new_groups.length; i < c; ++i) {
                this._drawGroup(new_groups[i]);
            }

            // Nodes
            for (var i = 0, c = new_nodes.length; i < c; ++i) {
                this._drawNode(new_nodes[i]);
            }
            // Edges
            for (var i = 0, c = newGraph.edges.length; i < c; i++) {
                this._drawEdge(newGraph.edges[i], true);
            }

            // Re-position the view
            this._secureGraphPosition();

            // Update the viewport
            this.updateDirtyOverview();
            this._updateOverviewPosition();


            ///////////////////////////////////
            // CLEANUP

            // Untie shapes from the old graph edges
            for (var i = 0, c = oldGraph.edges.length, e; i < c; ++i) {
                e = oldGraph.edges[i];
                delete e.connection;
                delete e.miniConnection;
            }

            // Untie shapes from the old nodes
            for (var i = 0, c = oldGraph.nodes.length, n; i < c; ++i) {
                n = oldGraph.nodes[i];
                delete n.shape;
                delete n.miniShape;
            }

        },

        show: function () {
            this.overviewContainer.style.display = "block";
            this.container.style.display = "block";
        },

        hide: function () {
            this.overviewContainer.style.display = "none";
            this.container.style.display = "none";
        },

        // Checks if the canvas is big enough to contain the graph, 
        // and increases its size if necessary
        _checkCanvasSize: function (width, height) {
            width = width || this.width;
            height = height || this.height;

            // The canvas width and height will be set to multiples of 500.
            var step = 500;

            var cWidth = width + (width % step);
            var cHeight = height + (height % step);

            if (this.svg.width() < cWidth || this.svg.height() < cHeight) {
                this.svg.width(Math.max(this.svg.width(), cWidth)).height(Math.max(this.svg.height(), cHeight));
            }
        },

        // Starts displaying commands on screen for the specified node.
        showCommands: function (node) {
            var selfRef = this;

            if (this.commandCurrentNode === node) {
                return; // Commands already in place, abort
            }

            if (!node.id in this.graph.nodes) {
                throw new 'This node does not seem to be currently displayed in the graph';
            }

            if (this.commandCurrentNode) {
                this.hideCommands();
            }

            var commands = this.graphType.getCommandsForNode(node);

            // Some settings
            var radiusStep = 23;
            var commandLines = Math.ceil(commands.length / 3);
            var currentRadius = node.radius + (radiusStep * (commandLines - 1)) + radiusStep / 2;

            // Create the background
            var backRadius = node.radius * 1.4;
            var diameter = backRadius * 2;
            this.commandBg = node.shape.rect(diameter + currentRadius, diameter)
                .attr({
                    'x': -backRadius,
                    'y': -backRadius,
                    'rx': backRadius,
                    'ry': backRadius,
                    'class': 'command-bg',
                    'opacity': 0
                })
                .back();
            this.commandBg.animate(300).opacity(0.5);

            this.commandBg.mouseout(function (e) {
                e = jQuery.event.fix(e);
                if (e.relatedTarget.getAttribute('class') != 'command-icon')
                    selfRef.hideCommands();

                /*
                var graphMouseCoords = selfRef.getGraphCoords(e.clientX, e.clientY);
                if(!selfRef.commandBg.inside(graphMouseCoords[0] - node.renderX, graphMouseCoords[1] - node.renderY)) {
                    selfRef.hideCommands();
                }
                */
            });

            if (node.radius > this.smallRadiusThreshold) {
                var i = commands.length;
                switch (i % 3) {
                    case 1:
                        this._createCommandIcon(commands[--i], node, currentRadius, 2);
                        currentRadius -= radiusStep;
                        break;
                    case 2:
                        this._createCommandIcon(commands[--i], node, currentRadius, 1);
                        this._createCommandIcon(commands[--i], node, currentRadius, 3);
                        currentRadius -= radiusStep;
                        break;
                }

                while (i > 0) {
                    this._createCommandIcon(commands[--i], node, currentRadius, 1);
                    this._createCommandIcon(commands[--i], node, currentRadius, 2);
                    this._createCommandIcon(commands[--i], node, currentRadius, 3);
                    currentRadius -= radiusStep;
                }
            }
            else {
                // Node is too small : everyone goes in the middle
                for (var i = 0, c = commands.length; i < c; ++i) {
                    this._createCommandIcon(commands[i], node, currentRadius, 2);
                }
            }

            this.commandBg.width(currentRadius + diameter + radiusStep);

            this.commandCurrentNode = node;
        },

        _createCommandIcon: function (command, node, radius, position) {
            // position can be 1 (top), 2 (middle) or 3 (bottom)
            var selfRef = this;
            var x = 0, y = 0;
            switch (position) {
                case 1:
                    x += radius - 6;
                    y -= 32;
                    break;
                case 2:
                    x += radius;
                    y -= 9;
                    break;
                case 3:
                    x += radius - 6;
                    y += 14;
                    break;
            }

            var icon = node.shape.image(createUrl('static/images/graph-commands/' + command.image)).attr({
                'x': x,
                'y': y,
                'class': 'command-icon',
                'opacity': 0
            });
            icon.animate(300).opacity(1);

            icon.click(function (e) {
                e = jQuery.event.fix(e);
                if (command.click) {
                    var pos = selfRef.getGraphCoords(e.clientX, e.clientY);
                    selfRef.mousex = pos[0];
                    selfRef.mousey = pos[1];

                    command.click(node, selfRef);
                }

                e.stopPropagation();
            });
            icon.mousedown(function (e) {
                e = jQuery.event.fix(e);
                if (command.mousedown) {
                    var pos = selfRef.getGraphCoords(e.clientX, e.clientY);
                    selfRef.mousex = pos[0];
                    selfRef.mousey = pos[1];
                    command.mousedown(node, selfRef);
                    e.preventDefault(); // Prevent dragging
                }
                e.stopPropagation();
            });

            icon._isCommand = true;

            this.commandIcons.push(icon);
            return icon;
        },

        // Hides any visible node commands
        hideCommands: function () {
            if (!this.commandCurrentNode)
                return; // Commands not visible, abort

            this.commandBg.remove();
            this.commandBg = null;

            for (var key in this.commandIcons) {
                this.commandIcons[key].remove();
            }

            this.commandIcons = [];

            this.commandCurrentNode = null;
        },

        // Translates the provided document coordinates into graph coordinates
        getGraphCoords: function (x, y) {
            var rootPos = jQuery(this.container.parentNode).offset();
            return [x + this.panX - rootPos.left, y + this.panY - rootPos.top];
        },

        // Translates the provided graph coordinates into document coordinates
        getDocumentCoords: function (x, y) {
            var rootPos = jQuery(this.container.parentNode).offset();
            return [x - this.panX + rootPos.left, y - this.panY + rootPos.top];
        },

        // Starts a "create link" operation. This should be called while the mouse is down,
        // and will draw a fake line between the mouse and the specified node until the user releases the mouse.
        // The objective is to allow the user to create a link with a preview. The preview automatically disappears
        // when the user releases the mouse.
        // When the user releases the mouse over an "accepted" node, the success callback is called, taking the pointed
        // node as a parameter
        // Every time the mouse enters a new node, the feedback callback will be called if provided, taking the hovered 
        // node as a parameter. The callback must then return a boolean specifying whether this node is an acceptable
        // link destination. If no feedback callback is provided, all the nodes will be considered acceptable except
        // the one specified in startNode (which is always an unacceptable destination)
        // If the user releases the mouse while it is not over an acceptable node, the abort callback will be called
        // without any parameter
        startCreateUserLink: function (startNode, successCallback, feedbackCallback, abortCallback) {
            var link = this.svg.line(startNode.renderX, startNode.renderY, this.mousex, this.mousey).attr({
                'class': 'edge preview'
            }).back();
            // Put all of this data into the link, so they can be accessed later through it
            link._startNode = startNode;
            link._successCallback = successCallback;
            link._abortCallback = abortCallback;
            link._feedbackCallback = feedbackCallback;

            this.currentMouseOperation = Bubbles.MOUSE_OPERATION_DRAW_LINK;
            this.draggingTarget = link;
        },

        _updateUserLinkPreview: function (e) {
            if (!this.draggingTarget._hoverNode) {
                var mPos = this.getGraphCoords(e.clientX, e.clientY);

                this.draggingTarget.plot(this.draggingTarget._startNode.renderX, this.draggingTarget._startNode.renderY, mPos[0], mPos[1]);
            }

            // We don't do hit detection there (for checking if the mouse is over a node or not). 
            // Instead we rely on the over/out events of each of the nodes
        },

        _createEdgeCommander: function (edge) {
            if (edge._commanderUi)
                return;

            var width = 52;
            var height = 22;
            var hWidth = width / 2;
            var hHeight = height / 2;
            var middleRadius = hHeight - 3;
            var set = this.svg.group()
                .attr({ 'class': 'edge-commander' })
                .mousedown(this._onEdgeCommanderMouseDown);
            set._edge = edge;

//            var background = set.rect(width, height).attr({
//                'x': -hWidth,
//                'y': -hHeight,
//                'rx': hHeight,
//                'ry': hHeight,
//                'class': 'comm-bg'
//            });

//            var leftArrowHitbox = set.rect(hWidth, hHeight).attr({
//                'x': -hWidth,
//                'y': -hHeight,
//                'radius': hHeight,
//                'class': 'comm-arrow-bg left'
//            }).click(this._onEdgeCommanderLeftClick);
//
//            var rightArrowHitbox = set.rect(hWidth, hHeight).attr({
//                'x': 0,
//                'y': -hHeight,
//                'radius': hHeight,
//                'class': 'comm-arrow-bg right'
//            }).click(this._onEdgeCommanderRightClick);

//            var leftArrow = set.path('M' + (middleRadius + 2) + ',' + (middleRadius - 2) + 'L' + (hWidth - 5) + ',0L' + (middleRadius + 2) + ',' + -(middleRadius - 2)).attr({
//                'class': 'comm-arrow'
//            }).click(this._onEdgeCommanderLeftClick);
//
//            var rightArrow = set.path('M' + -(middleRadius + 2) + ',' + (middleRadius - 2) + 'L' + -(hWidth - 5) + ',0L' + -(middleRadius + 2) + ',' + -(middleRadius - 2)).attr({
//                'class': 'comm-arrow'
//            }).click(this._onEdgeCommanderRightClick);

            var middleButton = set.ellipse(middleRadius * 2, middleRadius * 2).attr({
                'class': 'comm-middle',
                'cx': 0,
                'cy': 0,
            }).click(this._onEdgeCommanderCenterClicked);

            edge._commanderUi = set;
            this._computeEdgeCommanderDirection(edge);
            this._computeEdgeCommanderPosition(edge);
            this._updateEdgeCommander(edge);
            return set;
        },

        _computeEdgeCommanderPosition: function (edge) {
            if (!edge._commanderUi)
                return;

            edge._commanderUi._x = (edge.source.renderX + edge.target.renderX) / 2;
            edge._commanderUi._y = (edge.source.renderY + edge.target.renderY) / 2;
            edge._commanderUi._visible = Math.abs(edge.source.renderX - edge.target.renderX) > 30 || Math.abs(edge.source.renderY - edge.target.renderY) > 30;
        },

        _computeEdgeCommanderDirection: function (edge) {
            if (!edge._commanderUi)
                return;

            var opp = edge.target.renderY - edge.source.renderY;
            var adj = edge.target.renderX - edge.source.renderX;
            var angle = Math.atan(opp / adj) * Bubbles.RAD_TO_DEG;

            if (opp >= 0) {
                if (adj < 0) {
                    angle += 180;
                }
            }
            else {
                if (adj >= 0) {
                    angle += 360;
                }
                else {
                    angle += 180;
                }
            }

            edge._commanderUi._r = angle;
        },

        _updateEdgeCommander: function (edge) {
            if (!edge._commanderUi)
                return;
            edge._commanderUi.transform({
                'rotation': edge._commanderUi._r,
                'x': edge._commanderUi._x,
                'y': edge._commanderUi._y,
            }).style({
                'display': edge._commanderUi._visible ? '' : 'none'
            });

        },

        _removeEdgeCommander: function (edge) {
            if (!edge._commanderUi)
                return;

            var children = edge._commanderUi.children();
            for (var i = 0, c = children.length; i < c; ++i) {
                children[i].click(null);
                children[i].mousedown(null);
            }
            edge._commanderUi.clear();
            delete edge._commanderUi._edge;

            delete edge._commanderUi;
        },

        removeEdge: function (edge) {
            if (!edge.connection) {
                // This edge is not currently displayed
                return;
            }

            // Deselect. This will also remove the commander if it's there
            this._updateEdgeSelection(edge, false);

            edge.connection.remove();
            delete edge.connection;

            edge.miniConnection.remove();
            delete edge.miniConnection;
        },

        _unlockExtend: function () {
            this._allowExtend = true;
        },

        _lockExtend: function () {
            if (this._allowExtend) {
                // Update the graph bounding box
                this.graph.updateBbox();

                // Update the renderer size data
                this._updateGraphSize();

                // Update the overview
                this.updateDirtyOverview();

                this._allowExtend = false;

                // Make sure the viewport is kept inside the new bounds
                this._secureGraphPosition(true);
            }
        },

        // Changes the visual state of the specified node
        updateNodeState: function (node, newState) {
            if (node.state) {
                switch (node.state.state) {
                    case 1:
                        node.shape.removeClass('state-warning');
                        node.miniShape.removeClass('state-warning');
                        break;

                    case 2:
                        node.shape.removeClass('state-error');
                        node.miniShape.removeClass('state-error');
                        break;
                }
            }

            if (newState) {
                switch (newState.state) {
                    case 1:
                        node.shape.addClass('state-warning');
                        node.miniShape.addClass('state-warning');
                        break;

                    case 2:
                        node.shape.addClass('state-error');
                        node.miniShape.addClass('state-error');
                        break;
                }
            }

            node.state = newState;
        },

        // Changes the visual state of the specified group
        updateGroupState: function (group, newState) {
            if (group.state) {
                switch (group.state.state) {
                    case 1:
                        group.shape.removeClass('state-warning');
                        group.miniShape.removeClass('state-warning');
                        break;

                    case 2:
                        group.shape.removeClass('state-error');
                        group.miniShape.removeClass('state-error');
                        break;
                }
            }

            if (newState) {
                switch (newState.state) {
                    case 1:
                        group.shape.addClass('state-warning');
                        group.miniShape.addClass('state-warning');
                        break;

                    case 2:
                        group.shape.addClass('state-error');
                        group.miniShape.addClass('state-error');
                        break;
                }
            }

            group.state = newState;
        },
    
        // Creates a quick visual effect to attract the user's attention on a specified node
        flashNode: function(node) {
            var targetrx = 0;
            var targetry = 0;
            var startingRadius = Math.max(this.getElement().offsetWidth, this.getElement().offsetHeight);
            var rx, ry;
            // Check if node or group
            if(node.nodes) {
                // It's a group
                targetrx = node.bbox.width;
                targetry = node.bbox.height;
                rx = (node.bbox.left + node.bbox.right) / 2;
                ry = (node.bbox.top + node.bbox.bottom) / 2;
            }
            else {
                // It's a node
                targetrx = targetry = node.radius;
                rx = node.renderX;
                ry = node.renderY;
            }
            
            var pinger = this.svg.ellipse(startingRadius * 2, startingRadius * 2).attr({
                'class': 'pinger',
                'cx': rx,
                'cy': ry
            }).back();
            pinger.animate(500, '>').attr({
                'rx': targetrx, 
                'ry': targetry
            }).after(function() {
                pinger.remove();
            });
        }
    };

    // And finally some constants...
    Bubbles.MOUSE_OPERATION_NONE = 0; // The user's mouse button is up
    //Bubbles.MOUSE_OPERATION_DOWN = 1; // The user has pressed the button, but has not moved the cursor yet (not used)
    Bubbles.MOUSE_OPERATION_DRAGGING = 2; // The user is dragging one or several nodes
    Bubbles.MOUSE_OPERATION_OVERVIEW_PANNING = 3; // The user is dragging the overview position rectangle
    Bubbles.MOUSE_OPERATION_SELECTING = 4; // The user is drawing a selection rectangle
    Bubbles.MOUSE_OPERATION_DRAW_LINK = 5; // The user is drawing a link between two nodes

    Bubbles.RAD_TO_DEG = 180 / Math.PI;

    return Bubbles;
});
