export class pipeGame extends Phaser.Scene {

    constructor() {
        super({key: 'pipeGame'});
    }

    //Game config
    config = {
        gridXtiles: 9, //number of tiles horizontaly
        gridYtiles: 7, //number of tiles vertically
        numOfBlockedCells: null, //number of blocked cells || null -> calculate based on grid size
        numOfSidePipes: 4, //number of pieces draggable from the side
        waterDelay: 3, //delay waterflow does each time to flow
        waterStartDelay: -2, //start value for waterflow timer (first iteration only)
        winSize: null //pipe size to win || null -> assign random value based on grid size
    }

    //Global variables

    //Grid related
    //Grid drawing range offset 0-1 (in the screen, offseting to the left and above)
    gridXOffset = 0.8;
    gridYOffset = 1;
    marginScale = 0.9; //grid scale within space defined above
    gridCellPixelSize; //size in pixels of a tile
    cells;
    //Note: tile/cell structure
    /* {
        x: -> pixel position X of tile
        y: -> pixel position Y of tile
        type: -> Image tag associated
        image: -> Image itself associated
        upConnect, leftConnect, rightConnect, downConnect: -> true or false connections
        up, left, right, down: -> tile references
        parentCell -> added later for pathing
    } */
    startCell;

    //Side pieces
    sideCells;

    //Water pathing
    longestPath;
    //Note: node structure (inside longestPath)
    /*{
        image -> water image array
        cell -> tile reference
        parentNode -> node rederence
    }*/
    waterDrawCount;
    waterSpeed = 1;

    //Screen info text
    infoText;

    init()
    {
        //set up water path logic
        this.waterDrawCount = 0
        this.longestPath = [];
    }

    preload() {
        this.load.image('blocked', './assets/blocked.png');
        this.load.image('Cross', './assets/Cross.png');
        this.load.image('down-left', './assets/down-left.png');
        this.load.image('down-right', './assets/down-right.png');
        this.load.image('Straight-horizontal', './assets/Straight-horizontal.png');
        this.load.image('Straight-vertical', './assets/Straight-vertical.png');
        this.load.image('T-down', './assets/T-down.png');
        this.load.image('T-left', './assets/T-left.png');
        this.load.image('T-right', './assets/T-right.png');
        this.load.image('T-up', './assets/T-up.png');
        this.load.image('up-left', './assets/up-left.png');
        this.load.image('up-right', './assets/up-right.png');
        this.load.image('Start', './assets/Start.png');
        this.load.image('Background', './assets/Background.png');
        this.load.image('Empty', './assets/Empty.png');
        this.load.image('Egg', './assets/EasterEgg.png');
        this.load.spritesheet('Water', './assets/Water.png', {
            frameWidth: 250,
            frameHeight: 250
        });
        this.load.image('Dust', './assets/Particles/DustCloud.png');
        this.load.audio('Pipe', './assets/Audio/Pipe.wav');
        this.load.audio('Water', './assets/Audio/Water.wav');
        this.load.audio('OST', './assets/Audio/DrumLoop.mp3');
        this.load.audio('Win', './assets/Audio/Win.wav');
        this.load.audio('Lost', './assets/Audio/Lost.wav');
    }

    create() {

        //Variables set up
        if(this.numOfSidePipes < 2)
        {
            console.error('There is no space to add side pieces and queue! Forcing size 2.');
            this.numOfSidePipes = 2;
        }
        if(!this.config.numOfBlockedCells)
        {
            this.config.numOfBlockedCells = Math.floor(this.config.gridXtiles * this.config.gridYtiles / 8);
        }
        if(!this.config.winSize)
        {
            const min = this.config.gridXtiles * this.config.gridYtiles / 8;
            const max = this.config.gridXtiles * this.config.gridYtiles / 4;
            this.config.winSize = Math.floor(Math.random() * (max - min) + min);
        }

        //create water animation
        this.anims.create({
        key: 'Water',
        frameRate: 11,
        repeat: 0, //-1 for infinite loop
        frames: this.anims.generateFrameNumbers('Water', {
            frames: [0,1,2,3,4,5,6,7,8,9,10]
            })
        })

        //prepare audio
        this.sound.add('Pipe');
        this.sound.add('Water');
        this.sound.add('OST');
        this.sound.add('Win');
        this.sound.add('Lost');

        this.sound.play('OST', {loop:true});

        //set up grid
        this.createGrid();
        this.populateGrid();
        this.drawGrid();
        this.calculateWaterPath(this.startCell, null, 0);

        //set up timed water flow
        this.temp = this.time.addEvent({
            delay: this.config.waterDelay * 1000,
            callback: this.drawWater, 
            callbackScope: this,
            loop: true,
            startAt: this.config.waterStartDelay * 1000
        });

        //only interact with top most interactable
        this.input.topOnly = true;
    }

    update(){

        //Hover detection doesn't work when image alpha is 0 is visibility is disabled :(
        for(let i = 0; i < this.config.gridXtiles; i++)
        {
            for(let j = 0; j < this.config.gridYtiles; j++)
            {
                if(this.cells[i][j].type === 'Empty')
                {
                    if(Phaser.Geom.Rectangle.Contains(this.cells[i][j].image?.getBounds(),
                    this.input.activePointer.x, this.input.activePointer.y))
                    {
                        this.cells[i][j].image.setVisible(true);
                    }
                    else
                    {
                        this.cells[i][j].image.setVisible(false);
                    }
                }
            }
        }
    }

    //Macros
    createGrid()
    {
        this.cells = [];

        let gridPixelWidth = this.scale.gameSize.width * this.marginScale * this.gridXOffset;
        let gridPixelHeight = this.scale.gameSize.height * this.marginScale * this.gridYOffset;

        if(gridPixelWidth > gridPixelHeight)
        {
            this.gridCellPixelSize = gridPixelHeight / this.config.gridYtiles;
        }
        else
        {
            this.gridCellPixelSize = gridPixelWidth / this.config.gridXtiles;
        }

        let posX;
        let posY;
        const margin = 1;

        let cornerX = (this.scale.gameSize.width - this.gridCellPixelSize * this.config.gridXtiles) / 2
         - (this.scale.gameSize.width * (1 - this.gridXOffset)) / 2;
        let cornerY = (this.scale.gameSize.height - this.gridCellPixelSize * this.config.gridYtiles) / 2
         - (this.scale.gameSize.height * (1 - this.gridYOffset)) / 2;

        for(let i = 0; i < this.config.gridXtiles; i++)
        {
            posX = cornerX + i * this.gridCellPixelSize + margin * i;
            this.cells[i] = [];

            for(let j = 0; j < this.config.gridYtiles; j++)
            {
                posY = cornerY + j * this.gridCellPixelSize + margin * j;
                this.cells[i][j] = {x:posX, y:posY, type:'Empty', image:undefined,
                upConnect:null, leftConnect:null, rightConnect:null, downConnect:null};

                //set nearby tiles reference considering grid
                if(i !== 0) // x id 0 does not have left connections, skip
                {
                    this.cells[i][j].left = this.cells[i - 1][j];
                    this.cells[i - 1][j].right = this.cells[i][j];
                }
                else if(i === this.config.gridXtiles - 1)
                {
                    this.cells[i][j].right = null;
                }
                else
                {
                    this.cells[i][j].left = null;
                }
                if(j !== 0) // y id 0 does not have up connections, skip
                {
                    this.cells[i][j].up = this.cells[i][j - 1];
                    this.cells[i][j - 1].down = this.cells[i][j];
                }
                else if(j === this.config.gridYtiles - 1)
                {
                    this.cells[i][j].down = null;
                }
                else
                {
                    this.cells[i][j].up = null;
                }
            }
        }

        //side cell grid creation
        cornerX = this.scale.gameSize.width * this.gridXOffset * this.marginScale;
        cornerY = this.scale.gameSize.height * this.gridYOffset / 2
         - (this.gridCellPixelSize * this.config.numOfSidePipes) / 2;

        posX = cornerX + this.gridCellPixelSize;
        this.sideCells = [];

        for(let i = 0; i < this.config.numOfSidePipes; i++)
        {
            posY = cornerY + i * this.gridCellPixelSize + margin * i;
            this.sideCells[i] = {x:posX, y:posY, type:'Empty', image:undefined,
            upConnect:null, leftConnect:null, rightConnect:null, downConnect:null};
        }
    }

    populateGrid()
    {
        let random;
        let temp;
        let pass;

        //start cell
        pass = false;
        while(!pass)
        {
            random = Math.round(Math.random() * this.config.gridXtiles * this.config.gridYtiles);
            if(random === this.config.gridXtiles * this.config.gridYtiles) //count doesn't reach this far
            {
                continue;
            }
            temp = this.fetchIndexFromNum(random);

            //special rule: Not on last row
            if(temp.y === this.config.gridYtiles - 1)
            {
                continue;
            }

            //check for empty, reroll if needed...
            if(this.cells[temp.x][temp.y].type === 'Empty')
            {
                this.setConnectionsGrid(this.cells[temp.x][temp.y],
                true,true,true,true, temp.x,temp.y);
                this.cells[temp.x][temp.y].type = 'Start';
                
                //NEW
                this.startCell = this.cells[temp.x][temp.y];

                pass = true;
            }
        }

        //blocked cells
        for(let i = 0; i < this.config.numOfBlockedCells; i++)
        {
            pass = false;
            while(!pass)
            {
                random = Math.round(Math.random() * this.config.gridXtiles * this.config.gridYtiles);

                //Invalid index, reroll
                if(random === this.config.gridXtiles * this.config.gridYtiles)
                {
                    continue;
                }
                temp = this.fetchIndexFromNum(random);

                //special rule: Can't have start above
                if(temp.y !== 0 && this.cells[temp.x][temp.y - 1].type === 'Start')
                {
                    continue;
                }

                //check for empty, reroll if needed...
                if(this.cells[temp.x][temp.y].type === 'Empty')
                {
                    Object.assign(this.cells[temp.x][temp.y], 
                    {type:'blocked', leftConnect:false, rightConnect:false, 
                    upConnect:false, downConnect:false})
                    pass = true;
                }
            }
        }

        //Side pipe cells
        for(let i = 0; i < this.config.numOfSidePipes; i++)
        {
            Object.assign(this.sideCells[i], this.rollPipe());
        }
    }

    drawGrid()
    {
        //draw main grid background
        const background = this.add.tileSprite(this.cells[0][0].x, this.cells[0][0].y, 
        this.gridCellPixelSize * this.config.gridXtiles
        , this.gridCellPixelSize * this.config.gridYtiles, 'Background')
        .setOrigin(0);
        background.setTileScale(20 / this.gridCellPixelSize);
         

        //draw main grid
        for(let i = 0; i < this.config.gridXtiles; i++)
        {
            for(let j = 0; j < this.config.gridYtiles; j++)
            {
                this.cells[i][j].image = 
                this.add.image(this.cells[i][j].x
                , this.cells[i][j].y
                , this.cells[i][j].type)
                .setOrigin(0)
                .setDisplaySize(this.gridCellPixelSize, this.gridCellPixelSize);
            }
        }

        //draw side pieces
        for(let i = 0; i < this.config.numOfSidePipes; i++)
        {
            this.sideCells[i].image = 
            this.add.image(this.sideCells[i].x, this.sideCells[i].y, this.sideCells[i].type)
            .setOrigin(0)
            .setDisplaySize(this.gridCellPixelSize,this.gridCellPixelSize);
            
            if(i != this.config.numOfSidePipes - 1)
            {
                this.sideCells[i].image.setInteractive({draggable: true, useHandCursor: true});
                //Add listeners
                this.sideCells[i].image.on('drag', (pointer, dragX, dragY) => 
                {
                    this.sideCells[i].image.setPosition(dragX, dragY)
                }, this);
                this.sideCells[i].image.on('dragend', () => 
                this.tileDragStop(this.sideCells[i]), this);
            }
            else //Last side piece used as queue
            {
                this.sideCells[i].image.alpha = 0.5;
            }
        }

        //set up text above grid
        this.infoText = this.add.text(this.cells[0][0].x, (this.cells[0][0].y - 2) / 2,
         `Place ${this.config.winSize} pipes!`, 
         {
            fontSize: `${this.cells[0][0].y - 1}px`, 
            fill: '#FFFFFF',
            fontFamily: 'Arial'
         });
        this.infoText.setOrigin(0, 0.5);
    }

    //Helper functions
    setConnectionsGrid(cell, up, left, right, down, xID, yID)
    {
        //up connections
        if(yID > 0)
        {
            cell.upConnect = up;
        }
        //down connections
        if(yID < this.config.gridYtiles - 1)
        {
            cell.downConnect = down;
        }
        //left connections
        if(xID > 0)
        {
            cell.leftConnect = left;
        }
        //right connections
        if(xID < this.config.gridXtiles - 1)
        {
            cell.rightConnect = right;
        }
    }

    tileDragStop(tile)
    {
        //check if tile was dropped inside grid
        if(tile.image.x >= this.cells[0][0].x - this.gridCellPixelSize / 2
        && tile.image.x <= this.cells[this.config.gridXtiles - 1][this.config.gridYtiles - 1].x + this.gridCellPixelSize / 2
        && tile.image.y >= this.cells[0][0].y - this.gridCellPixelSize / 2
        && tile.image.y <= this.cells[this.config.gridXtiles - 1][this.config.gridYtiles - 1].y + this.gridCellPixelSize / 2)
        {
            let index = this.getTileIDFromPixelPosition(tile.image.x, tile.image.y);
            if(this.cells[index.x][index.y].type === 'Empty')
            {
                //Emmit particles
                this.startParticles(this.cells[index.x][index.y]);

                this.sound.play('Pipe');

                //update grid Tile
                Object.assign(this.cells[index.x][index.y],
                {
                    type: tile.type,
                    leftConnect: tile.leftConnect,
                    rightConnect: tile.rightConnect,
                    upConnect: tile.upConnect,
                    downConnect: tile.downConnect
                })
                this.updateTileIMG(this.cells[index.x][index.y]);

                //delete current Image sidePiece
                tile.image.destroy();

                this.sideCells[this.sideCells.length - 1].image.destroy();
                Object.assign(tile, {
                    upConnect: this.sideCells[this.sideCells.length - 1].upConnect,
                    downConnect: this.sideCells[this.sideCells.length - 1].downConnect,
                    leftConnect: this.sideCells[this.sideCells.length - 1].leftConnect,
                    rightConnect: this.sideCells[this.sideCells.length - 1].rightConnect,
                    type: this.sideCells[this.sideCells.length - 1].type
                    });
                this.updateTileIMG(tile);
                Object.assign(this.sideCells[this.sideCells.length - 1], this.rollPipe());
                this.updateTileIMG(this.sideCells[this.sideCells.length - 1]);
                this.sideCells[this.sideCells.length - 1].image.alpha = 0.5;

                //Add listeners to sidePiece
                tile.image.setInteractive({draggable: true, useHandCursor: true});
                tile.image.on('drag', (pointer, dragX, dragY) => tile.image.setPosition(dragX, dragY), this);
                tile.image.on('dragend', () => this.tileDragStop(tile), this);

                this.egg(this.cells[index.x][index.y]);
            }
        this.calculateWaterPath(this.startCell, null, 0);
        this.infoText.text = `Place ${this.config.winSize - (this.longestPath.length - 1)} pipes!`        }
        tile.image.setPosition(tile.x, tile.y);
    }

    drawWater()
    {
        this.sound.play('Water');

        //Star cell counts, but path length is 0 at start
        if(this.waterDrawCount < this.longestPath.length)
        {
            this.waterDrawCount++;
        }
        else //LOST CONDITION
        {
            this.returnToMainMenu(false);
        }

        //Delete current water images
        for(let i = 0; i < this.longestPath.length; i++)
        {
            for(let j = 0; j < this.longestPath[i].image?.length; j++)
            {
                this.longestPath[i].image[j].destroy();
            }
        }

        //Update water path
        this.calculateWaterPath(this.startCell, null, 0);

        //Create water images
        for(let i = this.longestPath.length - 1; i > this.longestPath.length - this.waterDrawCount - 1; i--)
        {
            this.longestPath[i].image = [];

            //NOTE: orientations
            //-PI/2 -> up
            //0 -> right
            //PI / 2 -> down
            //-PI -> left
            //water starts facing up, offset by PI / 2

            //water flow
            let rotationRadians;
            let connectingToParent;

            //left
            if(this.longestPath[i].cell.leftConnect
            && this.longestPath[i].cell.left?.rightConnect
            && this.pathRelationCheck(this.longestPath[i].cell,this.longestPath[i].cell.left))
            {
                //-Math.PI + Math.PI / 2
                rotationRadians = -Math.PI / 2;

                //Delay (for connections to !parent)
                connectingToParent = !(this.longestPath[i].cell.left === 
                this.longestPath[i].parentNode?.cell);

                //Flip
                if(!connectingToParent)
                {
                    rotationRadians += Math.PI;
                }
                
                this.setWaterIMG(rotationRadians, i, connectingToParent);
            }

            //right
            if(this.longestPath[i].cell.rightConnect
            && this.longestPath[i].cell.right?.leftConnect
            && this.pathRelationCheck(this.longestPath[i].cell,this.longestPath[i].cell.right))
            {
                //0 + Math.PI / 2
                rotationRadians = Math.PI / 2;

                //Assign delay (for connections to !parent)
                connectingToParent = !(this.longestPath[i].cell.right === 
                this.longestPath[i].parentNode?.cell);

                //Flip
                if(!connectingToParent)
                {
                    rotationRadians += Math.PI;
                }

                this.setWaterIMG(rotationRadians, i, connectingToParent);
            }

            //up
            if(this.longestPath[i].cell.upConnect
            && this.longestPath[i].cell.up?.downConnect
            && this.pathRelationCheck(this.longestPath[i].cell,this.longestPath[i].cell.up))
            {
                //-Math.PI / 2 + Math.PI / 2
                rotationRadians = 0;

                //Assign delay (for connections to !parent)
                connectingToParent = !(this.longestPath[i].cell.up === 
                this.longestPath[i].parentNode?.cell);

                //Flip
                if(!connectingToParent)
                {
                    rotationRadians += Math.PI;
                }

                this.setWaterIMG(rotationRadians, i, connectingToParent);
            }

            //down
            if(this.longestPath[i].cell.downConnect
            && this.longestPath[i].cell.down?.upConnect
            && this.pathRelationCheck(this.longestPath[i].cell,this.longestPath[i].cell.down))
            {
                //Math.PI / 2 + Math.PI / 2
                rotationRadians = Math.PI;

                //Assign delay (for connections to !parent)
                connectingToParent = !(this.longestPath[i].cell.down === 
                this.longestPath[i].parentNode?.cell);

                //Flip
                if(!connectingToParent)
                {
                    rotationRadians += Math.PI;
                }

                this.setWaterIMG(rotationRadians, i, connectingToParent);
            }
        }
    }

    //--NOTE: first iteration: (cell: this.startCell, parentCell: null, stepNum: 0)
    calculateWaterPath(currentCell, parentNodeReference, stepNum)
    {
        if(!currentCell)
        {
            console.error('Given cell is invalid');
            return;
        }

        let currentNode = {image:null, cell: currentCell, parentNode: parentNodeReference}

        //calculate next step
        //logic
         //if target cell is valid,
         //if current cell can go target cell,
         //if target cell can go to current cell,
         //if target cell is not one of current cell's parents

        //can go left?
        if(currentCell.leftConnect && currentCell.left?.rightConnect 
        && this.pathRepeatCheck(currentNode, currentCell.left, stepNum))
        {
            this.calculateWaterPath(currentCell.left, currentNode, stepNum + 1);
        }

        //can go right?
        if(currentCell.rightConnect && currentCell.right?.leftConnect 
        && this.pathRepeatCheck(currentNode, currentCell.right, stepNum))
        {
            this.calculateWaterPath(currentCell.right, currentNode, stepNum + 1);
        }

        // //can go up?
        if(currentCell.upConnect && currentCell.up?.downConnect 
        && this.pathRepeatCheck(currentNode, currentCell.up, stepNum))
        {
            this.calculateWaterPath(currentCell.up, currentNode, stepNum + 1);
        }

        // //can go down?
        if(currentCell.downConnect && currentCell.down?.upConnect
        && this.pathRepeatCheck(currentNode, currentCell.down, stepNum))
        {
            this.calculateWaterPath(currentCell.down, currentNode, stepNum + 1);
        }

        //record path
        if(stepNum > this.longestPath.length - 1)
        {
            this.longestPath = [];
            this.updatePath(currentNode);
            if(stepNum >= this.config.winSize) //WIN CONDITION
            {
                this.returnToMainMenu(true);
            }
        }
    }
    
    //Smaller helper functions
    rollPipe()
    {
        return this.pipeDictionary(Math.floor(Math.random() * 10));
    }

    fetchIndexFromNum(num)
    {
        if(num >= this.config.gridYtiles * this.config.gridXtiles || num < 0)
        {
            console.error("Number to convert to indexes is invalid!");
            return;
        }
        return{x: Math.floor(num / this.config.gridYtiles), y: num % this.config.gridYtiles};
    }

    updateTileIMG(cell, type)
    {
        cell.image?.destroy();
        if(type)
        {
            cell.type = type;
        }
        cell.image = this.add.image(cell.x, cell.y, cell.type)
            .setOrigin(0)
            .setDisplaySize(this.gridCellPixelSize, this.gridCellPixelSize);
    }

    pipeDictionary(num)
    {
        switch(num)
        {
            //Cross
            case 0:
            return {upConnect: true, leftConnect:true, rightConnect:true, downConnect:true, type: 'Cross'};
            //Down left
            case 1:
            return {upConnect: false, leftConnect:true, rightConnect:false, downConnect:true, type: 'down-left'};
            //Down right
            case 2:
            return {upConnect: false, leftConnect:false, rightConnect:true, downConnect:true, type: 'down-right'};
            //Straight-horizontal
            case 3:
            return {upConnect: false, leftConnect:true, rightConnect:true, downConnect:false, type: 'Straight-horizontal'};
            //Straight-vertical
            case 4:
            return {upConnect: true, leftConnect:false, rightConnect:false, downConnect:true, type: 'Straight-vertical'};
            //T-down
            case 5:
            return {upConnect: true, leftConnect:true, rightConnect:true, downConnect:false, type: 'T-down'};
            //T-left
            case 6:
            return {upConnect: true, leftConnect:false, rightConnect:true, downConnect:true, type: 'T-left'};
            //T-right
            case 7:
            return {upConnect: true, leftConnect:true, rightConnect:false, downConnect:true, type: 'T-right'};
            //T-up
            case 8:
            return {upConnect: false, leftConnect:true, rightConnect:true, downConnect:true, type: 'T-up'};
            //up-left
            case 9:
            return {upConnect: true, leftConnect:true, rightConnect:false, downConnect:false, type: 'up-left'};
            //up-right
            case 10:
            return {upConnect: true, leftConnect:false, rightConnect:true, downConnect:false, type: 'up-right'};
            default:
            console.error('pipeDictionary number was invalid. Must be 0-10, was:', num);
            break;
        }
    }

    getTileIDFromPixelPosition(x, y)
    {
        let tempX = x - this.cells[0][0].x + this.gridCellPixelSize / 2;
        let tempY = y - this.cells[0][0].y + this.gridCellPixelSize / 2;

        return {x: Math.floor(tempX / this.gridCellPixelSize)
        , y: Math.floor(tempY / this.gridCellPixelSize)};
    }

    updatePath(endingNode)
    {
        if(!endingNode)
        {
            console.error('Cell received was invalid.');
            return;
        }

        this.longestPath.push(endingNode);
        if(endingNode.parentNode)
        {
            this.updatePath(endingNode.parentNode);
        }
    }

    pathRepeatCheck(currentNode, newCell, stepNum)
    {
        let temp = currentNode;
        for(let i = 0; i < stepNum + 1; i++)
        {
            if(temp.cell === newCell)
            {
                return false;
            }
            temp = temp.parentNode;
        }
        return true;
    }

    pathRelationCheck(cell, goingToCell)
    {
        for(let i = 0; i < this.longestPath.length; i++)
        {
            //check if cell is parent
            if(this.longestPath[i].cell === goingToCell)
            {
                if(this.longestPath[i].parentNode?.cell === cell)
                {
                    return true;
                }
            }

            //check if goingToCell is parent
            if(this.longestPath[i].cell === cell)
            {
                if(this.longestPath[i].parentNode?.cell === goingToCell)
                {
                    return true;
                }
            }
        }
        return false;
    }

    setWaterIMG(rotation, index, connectionToParent)
    {
        const img = this.add.sprite(this.longestPath[index].cell.x + this.gridCellPixelSize / 2,
         this.longestPath[index].cell.y + this.gridCellPixelSize / 2,
          'Water');

        let delay;

        if(index === this.longestPath.length - 1)
        {
            delay = 0;
        }
        else
        {
            delay = connectionToParent ? 1000 : 0;
        }
        
        //Delay animation if not parent connection
        if(index === this.longestPath.length - this.waterDrawCount)
        {
            this.time.addEvent({
                delay: delay,
                callback:() => {
                    img.play('Water');
                }
            })
        }
        else
        {
            img.setFrame(this.anims.get('Water').frames[10].textureFrame);
        }

        this.longestPath[index].image.push(img);

        //Finish image flip if parent connection
        img.setOrigin(0.5, connectionToParent ? 1 : 0)
        .setDisplaySize(this.gridCellPixelSize, this.gridCellPixelSize / 2)
        .rotation = rotation;
    }

    startParticles(tile)
    {
        //Emmit particles
        this.add.particles(tile.x, tile.y, 'Dust',
        {
            frequency: 10,
            lifespan: {min: 250 , max: 750},
            quantity: Math.floor(Math.random() * 5) + 1,
            rotate: {random: true},
            scale: {
                start: 0,
                end: 0.5
            },
            speed: {min: 75, max: 125},
            x: {min: 50, max: 50},
            y: {min: 50, max: 50},
            stopAfter: 10
        })
    }

    egg(tile)
    {
        if(!tile.upConnect || Math.floor(Math.random() * 10) !== 0)
        {
            return;
        }

        const temp = this.add.image(tile.x + this.gridCellPixelSize / 2, tile.y, 'Egg')
        .setOrigin(0.5,1)
        .setDisplaySize(this.gridCellPixelSize / 3, this.gridCellPixelSize / 3);;

        this.time.addEvent({
            delay: 1000,
            callback: () => {
                temp.destroy();
            }, 
            callbackScope: this,
        });
    }

    returnToMainMenu(win)
    {
        this.sound.stopAll();

        if(win)
        {
            this.sound.play('Win');
        }
        else
        {
            this.sound.play('Lost');
        }

        this.scene.stop('pipeGame');
        this.scene.start('mainMenu', {win: win});
    }
}