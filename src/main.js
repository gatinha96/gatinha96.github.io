import { pipeGame } from './scenes/pipeGame.js';
import { mainMenu } from './scenes/mainMenu.js';

const config = {
    type: Phaser.AUTO,
    title: 'Pipe Mania',
    description: '',
    parent: 'game-container',
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    pixelArt: false,
    scene: [
        mainMenu,
        pipeGame
    ],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    dom: {
        createcontainer: true
    }
}

new Phaser.Game(config);