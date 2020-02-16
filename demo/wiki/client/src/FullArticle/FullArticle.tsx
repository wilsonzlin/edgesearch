import styles from './FullArticle.module.css';
import React from 'react';
import {ExternalLink} from '../ExternalLink/ExternalLink';

export type IFullArticle = {
  id: number,
  title: string,
  titleHtml: string,
  url: string,
  image: string,
  extractHtml: string,
}

export const FullArticle = ({
  title,
  titleHtml,
  url,
  image,
  extractHtml,
}: IFullArticle) => (
  <article className={styles.article}>
    <figure className={styles.left}>
      <img className={styles.image} alt={title} src={image}/>
    </figure>
    <div className={styles.right}>
      <h2 className={styles.title}>
        <ExternalLink className={styles.link} href={url}><span dangerouslySetInnerHTML={{__html: titleHtml}}/></ExternalLink>
      </h2>
      <p className={styles.extract} dangerouslySetInnerHTML={{__html: extractHtml}}/>
    </div>
  </article>
);
