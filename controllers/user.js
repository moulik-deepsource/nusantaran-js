const Users = require('../models/users');
const chalk = require('chalk');
const crypto = require('crypto');
const knex = require('knex');
const db_config = require('../models/db-config').config;
const { validationResult } = require('express-validator');
const db = knex(db_config);
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);


exports.getUser = (req, res)=>{
    Users.findUserByEmail(req.session.user.email).then((users)=>{
        try {
            const user = users[0];
            res.render('user/profile',{
                'title':`Nusantaran JS | My Account`,
                'path':`/profile`,
                'user': user
            })
        } catch (error) {
            console.log(error);
            res.status(500).redirect('/500');
        }
    }).catch(()=>{
        res.status(500).redirect('/500');
    });
};

exports.postLogout = (req, res) =>{
    console.log(chalk.yellow(`${req.session.user.email}: logged out`));
    req.session.destroy(err => {
        if (err){
            console.log(chalk.red('Error Found'));
            console.log(err);
        }
        res.status(200).redirect('/');
    });
}

exports.getReset = (req, res)=>{
    const error = req.flash('errorMessage');
    const errorMessage = error.length > 0 ? error[0] : null;
    const messageFLash = req.flash('message');
    const message = messageFLash.length > 0 ? messageFLash[0] : null;
    res.render('user/reset', {
        'title':'Nusantaran JS | Reset Password',
        'path':'/reset',
        'message': message,
        'errorMessage': errorMessage,
        'errors':[],
        'placeholder':{
            'name': null,
            'email':null,
            'address':null
        }
    });
}

exports.postReset = (req, res)=>{
    const validationError = validationResult(req);
    if (!validationError.isEmpty()){
        return res.status(422).render('user/reset', {
            'title':'Nusantaran JS | Reset Password',
            'path':'/reset',
            'message': null,
            'errorMessage': validationError.array()[0].msg,
            'errors': validationError.array(),
            'placeholder':{
                'email': req.body.email
            }
        });
    }
    db('users').where('email', req.body.email).then((users)=>{
        if (!users.length > 0){
            return res.status(422).render('user/reset', {
                'title':'Nusantaran JS | Reset Password',
                'path':'/reset',
                'message': null,
                'errorMessage': 'Email is not registered',
                'errors': [{param: 'email'}],
                'placeholder':{
                    'email': req.body.email
                }
            });
        }
        crypto.randomBytes(32, (error, buffer)=>{
            if (error){
                res.status(500).redirect('/500');
            } else {
                const token = buffer.toString('hex');
                const email = {
                    to: req.body.email,
                    from: process.env.MAIL_SENDER,
                    subject: 'Nusantaran Reset User Password',
                    text: 'Reset password',
                    html: `<h2>Yoohoo</h2><p>Reset your password <a href="http://${process.env.IP_PUBLIC}/newpassword?email=${req.body.email}&token=${token}">here</a></p>`
                };
                db('resettoken').returning('*').insert({
                    useremail: req.body.email,
                    token: token,
                    expired: Date.now() + 3600000
                }).then(()=>{
                    sgMail.send(email).then(()=>{
                        req.flash('message', 'Email has been sent, token is valid for one hour, please check your email');
                        res.status(200).redirect('/reset');
                    }).catch((err)=>{
                        console.log(err);
                        res.status(500).redirect('/500');
                    })
                }).catch(()=>{
                    db('resettoken').where('useremail', req.body.email).update({
                        token: token,
                        expired: Date.now() + 3600000
                    }).then(()=>{
                        sgMail.send(email).then(()=>{
                            req.flash('message', 'Expiration token has been updated to 1 hour, please check your email');
                            res.status(200).redirect('/reset');
                        }).catch((err)=>{
                            console.log(err);
                            res.status(500).redirect('/500');
                        })
                    }).catch((err)=>{
                        console.log(err);
                        res.status(500).redirect('/500');
                    });
                });
            }
        });
    });
}

exports.getNewPassword = (req, res)=>{
    const email = req.query.email;
    const token = req.query.token;
    if (email === undefined || token === undefined){
        return res.status(404).redirect('/404');
    }
    const error = req.flash('errorMessage');
    const errorMessage = error.length > 0 ? error[0] : null;
    db('resettoken').where('useremail', email).then((users)=>{
        if (users.length === 0){
            throw new Error('User not found');
        } else {
            const user = users[0];
            let error = null;
            if (token == user.token){
                if (user.expired < Date.now()){
                    error = 'Sorry, your token is expired';
                }
            } else {
                error = 'Wrong token for this user';
            }
            res.render('user/new-password', {
                'title':'Nusantaran JS | Set New Password',
                'path':'/newpassword',
                'token': token,
                'email': email,
                'error': error,
                'errorMessage': errorMessage,
                'errors':[]
            });
        }
    }).catch((err)=>{
        console.log(err);
        res.render('user/new-password', {
            'title':'Nusantaran JS | Set New Password',
            'path':'/newpassword',
            'token': token,
            'email': email,
            'error': 'Sorry, the user you are looking for is not found',
            'errorMessage': errorMessage,
            'errors':[]
        });
    });
}

exports.postNewPassword = (req, res)=>{
    const email = req.body.email;
    const token = req.body.token;
    if (email === undefined || token === undefined){
        console.log(email, token);
        return res.status(404).redirect('/404');
    }
    const validationError = validationResult(req);
    const password = req.body.password;
    if (!validationError.isEmpty()){
        return res.status(422).render('user/new-password', {
            'title':'Nusantaran JS | Set New Password',
            'path':'/newpassword',
            'errorMessage': validationError.array()[0].msg,
            'errors': validationError.array(),
            'error': null,
            'token': token,
            'email': email
        });
    }
    Users.updatePassword(email, password).then((users)=>{
        const user = users[0];
        db('resettoken').where('useremail', user.email).del().then(()=>{
            res.status(200).redirect('/profile');
        }).catch((error)=>{
            console.log(error);
            res.status(500).redirect('/500');
        });
    }).catch((error)=>{
        console.log(error);
        res.status(500).redirect('/500');
    });
}