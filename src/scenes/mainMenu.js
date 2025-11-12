export class mainMenu extends Phaser.Scene {

    constructor() {
        super({key: 'mainMenu'});
    }

    text;

    init(data){
        //win = null means first mainMenu
        if(data.win === false)
        {
            //this.gameContainerDiv.style.backgroundColor = 'red';
            this.text = 'You lost...'
        }
        else if(data.win === true)
        {
            this.text = 'You win!'
        }
        else
        {
            this.text = ''
        }
    }

    create() {

        if(this.text)
        {
            this.add.text(this.scale.gameSize.width / 2, this.scale.gameSize.height * 1.5 / 4,
            this.text, 
            { fontSize: `${this.scale.gameSize.height / 16}px`, fill: '#FFFFFF' })
            .setOrigin(0.5, 0.5);
        }

        this.add.text(this.scale.gameSize.width / 2, this.scale.gameSize.height * 2.5 / 4,
         'Click to play!', 
         { fontSize: `${this.scale.gameSize.height / 16}px`, fill: '#FFFFFF' })
        .setOrigin(0.5, 0.5);
        
        this.input.on('pointerdown', () =>
        {
            this.scene.stop('mainMenu');
            this.scene.start('pipeGame');
        }, this);
    }
}